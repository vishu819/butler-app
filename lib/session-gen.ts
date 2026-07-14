// Phase 2 session generation: pick the 2 weakest sectors and generate a few
// deep questions each at that sector's CURRENT level (gradual journey).
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { SKILLS, SKILL_KEYS, LEVEL_NAME } from "@/lib/skills";

export type SessionQuestion = {
  skill: string;
  level: number;
  concept: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  followup_prompt: string; // the open question the user types an answer to
};

type SkillRow = { skill: string; level?: number; proficiency?: number; seen?: number };

// Choose a BROAD spread of sectors to cover, weighted toward weak areas, while
// deprioritizing skills covered in recent sessions so every competency cycles
// over roughly a week. `recentlyCovered` = skill keys from the last few sessions.
export function pickFocusSkills(
  rows: SkillRow[],
  n = 4,
  recentlyCovered: string[] = []
): { key: string; level: number; label: string }[] {
  // Count how recently each skill was covered (0 = not recent).
  const recencyCount = new Map<string, number>();
  recentlyCovered.forEach((k) => recencyCount.set(k, (recencyCount.get(k) || 0) + 1));

  const state = SKILLS.map((s) => {
    const r = rows.find((x) => x.skill === s.key);
    const proficiency = r?.proficiency ?? 0;
    const seen = r?.seen ?? 0;
    const recent = recencyCount.get(s.key) || 0;
    // Priority score: weaker = higher; never-seen = highest; recently-covered = penalized.
    // (lower score sorts first)
    const weakness = seen === 0 ? -20 : proficiency; // untested first
    const score = weakness + recent * 30; // push recently-covered to the back
    return { key: s.key, label: s.label, level: r?.level ?? 1, proficiency, seen, score };
  });

  const ranked = [...state].sort((a, b) => a.score - b.score);
  return ranked.slice(0, n).map((s) => ({ key: s.key, level: s.level, label: s.label }));
}

const SYS =
  "You are Butler, a staff-level software-architecture mentor writing a daily learning session. Write SPECIFIC, deep questions rooted in REAL large-scale software problems — the hard tradeoffs and failure modes that senior engineers and architects actually face and commonly get WRONG: consistency vs availability under partition, hot-partition and sharding pitfalls, cache stampede/invalidation, backpressure and queue overload, idempotency and exactly-once myths, N+1 and index design, thundering herd, cascading failure and bulkheads, schema evolution, tail latency. Prefer concrete scenarios with real numbers and named failure modes over textbook definitions. Difficulty matches the stated level (1 = approachable for a mid-level engineer, 5 = staff/architect depth). Each question has a multiple-choice part AND an open follow-up that forces the learner to explain the underlying tradeoff/reasoning. Return JSON only.";

// Web-grounding step: gather real-world failure cases / tradeoffs for the focus
// skills using OpenRouter's :online plugin. Returns plain text. Best-effort — on
// failure returns "" and generation falls back to model knowledge.
export async function gatherWebContext(
  focus: { key: string; level: number; label: string }[]
): Promise<string> {
  try {
    const topics = focus.map((f) => f.label).join(" and ");
    return await chat(
      [
        {
          role: "system",
          content:
            "You research real-world engineering failure cases and tradeoffs. Return concise plain-text notes (no preamble): 3-5 specific, well-known incidents or commonly-cited gotchas that make great quiz material.",
        },
        {
          role: "user",
          content: `Give real-world failure cases, famous incidents, and commonly-misunderstood tradeoffs for: ${topics}. Focus on things senior engineers get wrong. Keep it under 250 words.`,
        },
      ],
      { model: modelFor("web"), online: true, temperature: 0.4, maxTokens: 500, timeoutMs: 25000 }
    );
  } catch {
    return "";
  }
}

export async function generateSession(
  focus: { key: string; level: number; label: string }[],
  perSkill: number,
  webContext?: string,
  newTopic?: { topic: string; skill: string } | null
): Promise<SessionQuestion[]> {
  const spec = focus
    .map((f) => `- ${perSkill} REINFORCEMENT questions on "${f.key}" (${f.label}) at level ${f.level}/5 (${LEVEL_NAME[f.level]})`)
    .join("\n");

  // Guarantee daily novelty: always include a couple of questions on a brand-new
  // concept the learner hasn't seen, introduced at an approachable level.
  const newSpec = newTopic
    ? `\n- 2 questions introducing a NEW concept the learner hasn't studied: "${newTopic.topic}" (skill "${newTopic.skill}") at level 1-2 (approachable first exposure — teach, don't trick).`
    : "";

  const raw = await chat(
    [
      { role: "system", content: SYS },
      {
        role: "user",
        content: `Generate a focused daily session. The learner should LEARN SOMETHING NEW today AND reinforce a weak area:
${spec}${newSpec}
${webContext ? `\nGround the questions in this real reference material:\n${webContext}\n` : ""}
For each question provide a multiple-choice question AND a follow-up open question (the learner will TYPE a short answer to the follow-up — it should push them to explain the tradeoff or reasoning behind the MCQ answer). For the NEW concept, the explanation should genuinely teach it.

Return JSON:
{"questions":[{"skill":"the skill key","level":<the level number>,"concept":"short tag e.g. 'write-heavy sharding'","question":"specific MCQ","options":["A","B","C","D"],"correct":0,"explanation":"3-5 sentences teaching the principle","followup_prompt":"an open question probing WHY / the tradeoff, answerable in 2-3 sentences"}]}
Exactly 4 options each, vary the correct index. Make scenarios concrete (real numbers, real failure modes).`,
      },
    ],
    { model: modelFor("generate"), json: true, temperature: 0.8, maxTokens: 6000, timeoutMs: 58000 }
  );

  return parseSession(raw);
}

export function parseSession(raw: string): SessionQuestion[] {
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
      (q: any): q is SessionQuestion =>
        q &&
        q.skill &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        Number.isInteger(q.correct) &&
        q.correct >= 0 &&
        q.correct <= 3 &&
        typeof q.explanation === "string" &&
        typeof q.followup_prompt === "string"
    );
}
