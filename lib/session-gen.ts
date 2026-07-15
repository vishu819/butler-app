// Phase 2 session generation: pick the 2 weakest sectors and generate a few
// deep questions each at that sector's CURRENT level (gradual journey).
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { SKILLS, ALL_SKILLS, ALL_SKILL_KEYS, LEVEL_NAME } from "@/lib/skills";

export type FollowupMCQ = {
  q: string;
  options: string[];
  correct: number;
  explanation: string;
};

export type SessionQuestion = {
  skill: string;
  level: number;
  concept: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  followup_prompt: string; // the open question the user types an answer to
  followup_mcqs?: FollowupMCQ[]; // 3 deeper MCQs on the same concept (graded locally)
};

type SkillRow = { skill: string; level?: number; proficiency?: number; seen?: number };

// Choose a BROAD spread of sectors to cover, weighted toward weak areas, while
// deprioritizing skills covered in recent sessions so every competency cycles
// over roughly a week. `recentlyCovered` = skill keys from the last few sessions.
export function pickFocusSkills(
  rows: SkillRow[],
  n = 4,
  recentlyCovered: string[] = [],
  allowedSkillKeys?: string[]
): { key: string; level: number; label: string }[] {
  // Count how recently each skill was covered (0 = not recent).
  const recencyCount = new Map<string, number>();
  recentlyCovered.forEach((k) => recencyCount.set(k, (recencyCount.get(k) || 0) + 1));

  // Restrict to the learner's role skill set when provided; otherwise all.
  const pool = allowedSkillKeys
    ? ALL_SKILLS.filter((s) => allowedSkillKeys.includes(s.key))
    : SKILLS;
  const state = pool.map((s) => {
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
  "You are Butler, a software-architecture mentor writing a daily learning session that walks the learner INCREMENTALLY from fundamentals to real architect-level judgment. The end goal is architect thinking, but you get there in stages — you do NOT hand someone a staff-level multi-region-consistency tradeoff before they've got the basics of that topic. CALIBRATE every question's depth to its stated level (1-5). Ramp the learner up; never skip ahead. All questions still concern REAL software problems (consistency vs availability, sharding/hot-partitions, cache invalidation, backpressure, idempotency, index design, cascading failure, schema evolution, tail latency, quorum/replication) — what changes with level is how much judgment and how many competing forces the question demands. Each question has a multiple-choice part AND an open follow-up that pushes the learner to explain their reasoning. Return JSON only.";

// Per-level rubric so difficulty is INCREMENTAL, not uniformly "architect-hard".
// Fundamentals are taught cleanly at low levels; the full tradeoff framing is
// reserved for a learner who has already earned it at this skill.
const LEVEL_RUBRIC: Record<number, string> = {
  1: "LEVEL 1 (Foundational): teach the core mechanism cleanly. One clear correct answer, plausible-but-wrong distractors. A single concept, no competing tradeoffs yet. Concrete but small-scale. Goal: build correct intuition.",
  2: "LEVEL 2 (Applied): apply the concept to a realistic (still bounded) scenario. Introduce ONE tradeoff or failure mode. The learner should reason, not just recall.",
  3: "LEVEL 3 (Intermediate): a real design choice between two defensible options, with a clear-ish best answer once you reason it through. Include concrete numbers (QPS, size, latency). One second-order effect to notice.",
  4: "LEVEL 4 (Advanced): a genuine architect tradeoff — the 'obvious' answer is subtly wrong; every option is something a competent engineer might pick. Real scale, multiple interacting constraints, name the real system/incident it echoes when you can.",
  5: "LEVEL 5 (Staff/architect): the hard case seniors get WRONG. Competing second-order effects, no free lunch — the best answer wins only on a subtle margin. Force the learner to weigh what they give up. Ground it in a real large-scale failure.",
};

const levelRubric = (lv: number): string => LEVEL_RUBRIC[Math.max(1, Math.min(5, lv || 1))];

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
  newTopic?: { topic: string; skill: string } | null,
  pathTopics?: { topic: string; skill: string; rationale?: string }[],
  roleFraming?: string
): Promise<SessionQuestion[]> {
  const spec = focus
    .map(
      (f) =>
        `- ${perSkill} REINFORCEMENT questions on "${f.key}" (${f.label}) at level ${f.level}/5 (${LEVEL_NAME[f.level]}).\n  ${levelRubric(f.level)}`
    )
    .join("\n");

  // Anchor reinforcement to the learner's ACTIVE curriculum topics — the session
  // must advance their PATH, not drift onto unrelated trivia. Tie each active
  // path topic to whichever focus skill it maps to.
  const pathSpec = (pathTopics || []).length
    ? `\nThese are the learner's ACTIVE path topics — frame reinforcement questions around them wherever the skill matches, so the session moves their plan forward:\n${(pathTopics || [])
        .map((p) => `- "${p.topic}" (skill "${p.skill}")${p.rationale ? ` — ${p.rationale}` : ""}`)
        .join("\n")}`
    : "";

  // Guarantee daily novelty: always include one question on a brand-new concept
  // the learner hasn't seen, introduced at an approachable level.
  const newSpec = newTopic
    ? `\n- 1 question introducing a NEW concept the learner hasn't studied: "${newTopic.topic}" (skill "${newTopic.skill}") at level 1-2 (approachable first exposure — teach, don't trick).`
    : "";

  const raw = await chat(
    [
      { role: "system", content: roleFraming ? `${SYS}\n\nTARGET ROLE CONTEXT: ${roleFraming}` : SYS },
      {
        role: "user",
        content: `Generate a focused daily session of EXACTLY ${focus.length * perSkill + (newTopic ? 1 : 0)} questions. The learner should LEARN SOMETHING NEW today AND reinforce a weak area:
${spec}${pathSpec}${newSpec}
Produce ALL of the questions listed above — do not omit any.
${webContext ? `\nGround the questions in this real reference material:\n${webContext}\n` : ""}
USE WEB SEARCH to ground questions in REAL, current material: recent postmortems, well-known outages, up-to-date best practices, and real system designs for these topics. Base scenarios on things that actually happened (name the company/system/incident where you can) rather than invented examples.

CALIBRATE each question to ITS stated level using the rubric above — do not write a level-5 tradeoff for a level-1 skill or vice versa. The learner rises one step at a time.

For each question provide: (a) a multiple-choice question, (b) a follow-up OPEN question the learner types a short answer to (push them to explain the reasoning, at a depth appropriate to the level), and (c) exactly 3 deeper follow-up MULTIPLE-CHOICE questions on the SAME concept at the SAME level, drilling progressively into it (each stands alone, graded automatically). For the NEW concept, the explanation should genuinely teach it.

Return ONLY a JSON object (no prose, no citations outside the JSON):
{"questions":[{"skill":"the skill key","level":<the level number>,"concept":"short tag e.g. 'write-heavy sharding'","question":"specific MCQ","options":["A","B","C","D"],"correct":0,"explanation":"3-5 sentences teaching the principle","followup_prompt":"an open question probing WHY / the tradeoff, answerable in 2-3 sentences","followup_mcqs":[{"q":"a deeper MCQ on the same concept","options":["A","B","C","D"],"correct":0,"explanation":"1-2 sentences on why"}]}]}
Exactly 4 options for every MCQ (main and follow-ups), vary the correct index. Exactly 3 items in followup_mcqs. Match each question's concreteness to its level (higher levels get real numbers and named incidents; lower levels stay clean and focused).`,
      },
    ],
    // :online grounds questions in real incidents/best-practices. json:true keeps
    // the output parseable; salvageQuestions() recovers if the web plugin adds
    // stray prose or the response truncates. 16000 tokens fits 8 rich questions.
    { model: modelFor("generate"), online: true, json: true, temperature: 0.8, maxTokens: 16000, timeoutMs: 75000 }
  );

  return parseSession(raw);
}

export function parseSession(raw: string): SessionQuestion[] {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    // Salvage a truncated response: recover whole question objects even when the
    // tail is cut off (finish_reason: length). Beats returning zero questions.
    obj = salvageQuestions(raw);
    if (!obj) return [];
  }
  const arr = Array.isArray(obj?.questions) ? obj.questions : [];
  return arr
    .map((q: any) => ({
      ...q,
      skill: ALL_SKILL_KEYS.includes(q?.skill) ? q.skill : null,
      followup_mcqs: sanitizeFollowupMCQs(q?.followup_mcqs),
    }))
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

// Recover complete question objects from a truncated JSON string (the model hit
// the token cap mid-array). Walks the top-level questions array, extracting each
// balanced {...} object and dropping the final incomplete one.
function salvageQuestions(raw: string): { questions: any[] } | null {
  const start = raw.indexOf('"questions"');
  if (start === -1) return null;
  const bracket = raw.indexOf("[", start);
  if (bracket === -1) return null;

  const objects: any[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;

  for (let i = bracket + 1; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          objects.push(JSON.parse(raw.slice(objStart, i + 1)));
        } catch {
          /* skip a malformed object */
        }
        objStart = -1;
      }
    }
  }
  return objects.length ? { questions: objects } : null;
}

// Keep only well-formed follow-up MCQs (4 options, valid correct index). Missing
// or malformed follow-ups just yield an empty list — the main question still stands.
function sanitizeFollowupMCQs(raw: any): FollowupMCQ[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m: any): m is FollowupMCQ =>
        m &&
        typeof m.q === "string" &&
        Array.isArray(m.options) &&
        m.options.length === 4 &&
        Number.isInteger(m.correct) &&
        m.correct >= 0 &&
        m.correct <= 3
    )
    .slice(0, 3)
    .map((m: any) => ({
      q: m.q,
      options: m.options,
      correct: m.correct,
      explanation: typeof m.explanation === "string" ? m.explanation : "",
    }));
}
