// Shared skill-aware quiz generation, used by both the on-demand route
// (/api/generate-quiz) and the daily cron so they stay in sync.
import { chat } from "@/lib/openrouter";
import { SKILLS, SKILL_KEYS, LEVEL_NAME } from "@/lib/skills";

export type SkillState = {
  key: string;
  label: string;
  level: number;
  proficiency: number;
  seen: number;
};

export type QuizQuestion = {
  skill: string;
  concept: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
};

// Build the full 12-skill view from whatever profile rows exist (defaults for untested).
export function buildSkillState(
  profileRows: { skill: string; level?: number; proficiency?: number; seen?: number }[]
): SkillState[] {
  const prof = new Map(profileRows.map((r) => [r.skill, r]));
  return SKILLS.map((s) => {
    const p = prof.get(s.key);
    return {
      key: s.key,
      label: s.label,
      level: p?.level ?? 1,
      proficiency: p?.proficiency ?? 0,
      seen: p?.seen ?? 0,
    };
  });
}

const SYS =
  "You are Butler, a staff-level software architect setting a practical assessment for an engineer training to become an architect. You write SPECIFIC, real-world multiple-choice questions grounded in situations senior engineers and architects actually face — capacity/scalability decisions, failure modes in production, tradeoffs under real constraints, debugging distributed behavior, choosing between concrete technologies. NEVER ask open-ended 'design X' prompts or trivia definitions. Each question targets one named skill at a stated difficulty level, and each explanation teaches the underlying principle in depth (why the right answer wins, why the tempting wrong ones fail, and the rule to carry forward). Return JSON only.";

function batchPrompt(focus: SkillState[], askedQuestions: string[]): string {
  const spec = focus
    .map((f) => `- skill "${f.key}" (${f.label}) at level ${f.level}/5 (${LEVEL_NAME[f.level]})`)
    .join("\n");
  return `Generate exactly ${focus.length} questions, ONE for each of these skills at its stated level (harder as level rises):
${spec}

Recently asked (do NOT repeat these): ${askedQuestions.map((q) => `"${q}"`).join("; ") || "(none)"}

Return JSON:
{"questions":[{"skill":"the skill key exactly as given","concept":"short human tag e.g. 'backpressure'","question":"a specific, practical, scenario-based question","options":["A","B","C","D"],"correct":0,"explanation":"3-5 sentences teaching the principle in depth."}]}
Exactly 4 options each, vary the correct index, make scenarios concrete (real numbers, real failure modes).`;
}

// Safely parse an LLM batch into valid, skill-tagged questions. Bad JSON -> [].
export function parseQuestions(raw: string): QuizQuestion[] {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    return [];
  }
  const arr = Array.isArray(obj?.questions) ? obj.questions : [];
  return arr
    .map((q: any) => ({ ...q, skill: SKILL_KEYS.includes(q?.skill) ? q.skill : null }))
    .filter(
      (q: any): q is QuizQuestion =>
        q &&
        q.skill &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every((o: any) => typeof o === "string") &&
        Number.isInteger(q.correct) &&
        q.correct >= 0 &&
        q.correct <= 3 &&
        typeof q.explanation === "string"
    );
}

// Generate a 10-question skill-targeted quiz. Returns the questions (may be <10
// if a batch failed, but never throws for a single bad batch).
export async function generateQuiz(
  skillState: SkillState[],
  askedQuestions: string[]
): Promise<QuizQuestion[]> {
  // Weakest & least-seen first: untested skills rank highest for coverage,
  // then lowest proficiency to target weaknesses.
  const ranked = [...skillState].sort((a, b) => {
    const aScore = a.seen === 0 ? -1 : a.proficiency;
    const bScore = b.seen === 0 ? -1 : b.proficiency;
    return aScore - bScore;
  });
  const focusA = ranked.slice(0, 5);
  const focusB = ranked.slice(5, 10).length >= 5 ? ranked.slice(5, 10) : ranked.slice(0, 5);

  const settled = await Promise.allSettled([
    chat(
      [
        { role: "system", content: SYS },
        { role: "user", content: batchPrompt(focusA, askedQuestions) },
      ],
      { json: true, temperature: 0.8, maxTokens: 3200, timeoutMs: 55000 }
    ),
    chat(
      [
        { role: "system", content: SYS },
        { role: "user", content: batchPrompt(focusB, askedQuestions) },
      ],
      { json: true, temperature: 0.85, maxTokens: 3200, timeoutMs: 55000 }
    ),
  ]);

  return settled
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .flatMap((r) => parseQuestions(r.value));
}

export const QUIZ_TITLE = "Architect Assessment — Daily Quiz";
