import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { SKILL_LABEL } from "@/lib/skills";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST -> process today's completed session with the LLM: update learner profile,
// per-skill proficiency (with slow-ramp levels), and curriculum mastery.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: session } = await supabase
    .from("sessions")
    .select("id, focus_skills, questions, responses, status")
    .eq("user_id", user.id)
    .eq("session_date", today)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "no session" }, { status: 404 });
  if (session.status !== "complete") {
    return NextResponse.json({ error: "session not complete" }, { status: 400 });
  }

  const questions = session.questions as any[];
  const responses = (session.responses as any[]) || [];

  // Build a transcript for the LLM to analyze.
  const transcript = questions
    .map((q, i) => {
      const r = responses.find((x) => x.qi === i);
      const fuLine =
        r?.fu_total
          ? `\n  Deeper follow-up MCQs: ${r.fu_correct}/${r.fu_total} correct`
          : "";
      return `Q${i + 1} [${SKILL_LABEL[q.skill] || q.skill}, level ${q.level}] concept: ${q.concept}
  MCQ: ${r?.mcq_correct ? "CORRECT" : "WRONG"}
  Follow-up asked: ${q.followup_prompt}
  Their written answer: "${r?.followup_text || "(blank)"}"
  Graded: ${r?.followup_score ?? "n/a"}/100 — ${r?.feedback || ""}${fuLine}`;
    })
    .join("\n\n");

  // Current profile to evolve.
  const { data: prof } = await supabase
    .from("learner_profile")
    .select("narrative, strengths, gaps, misconceptions")
    .eq("user_id", user.id)
    .maybeSingle();

  // Per-skill cumulative record — the LLM judges on the TREND, not just today.
  const focusSkills = (session.focus_skills || []) as string[];
  const { data: skillRows } = await supabase
    .from("skill_profile")
    .select("skill, level, proficiency, seen, correct, sessions_at_level, history")
    .eq("user_id", user.id)
    .in("skill", focusSkills);
  const cur = new Map((skillRows || []).map((r) => [r.skill, r]));

  // Confidence gate: only consider a level MOVE once the learner has ~4 sessions
  // of evidence at the current level. Below that we hold and accumulate.
  const MIN_SESSIONS_TO_MOVE = 4;

  const historyBlock = focusSkills
    .map((sk) => {
      const r = cur.get(sk);
      const hist = ((r?.history as any[]) || [])
        .slice(-6)
        .map((h) => `  ${h.date}: L${h.level} understanding ${h.understanding} (${h.verdict})`)
        .join("\n");
      const atLevel = r?.sessions_at_level ?? 0;
      const eligible = atLevel + 1 >= MIN_SESSIONS_TO_MOVE;
      return `${SKILL_LABEL[sk] || sk} — current level ${r?.level ?? 1}, ${atLevel} prior sessions at this level (${eligible ? "ELIGIBLE for a level decision" : "still accumulating — HOLD unless basics are clearly broken"}):
${hist || "  (no prior history at this level)"}`;
    })
    .join("\n\n");

  // ---- LLM analyzes the session and JUDGES progression per skill ----
  // The LLM (not a threshold) decides advance/hold/downgrade from the full
  // transcript. Code only guards against absurd jumps.
  type Verdict = "advance" | "hold" | "downgrade";
  let analysis: {
    narrative: string;
    strengths: string[];
    gaps: string[];
    misconceptions: { topic: string; note: string }[];
    per_skill: { skill: string; understanding: number; verdict: Verdict; reasoning: string }[];
  };
  try {
    const raw = await chat(
      [
        {
          role: "system",
          content:
            "You are Butler, a rigorous but PATIENT mentor. You judge a learner's readiness to change level based on their CUMULATIVE record across many sessions — never on a single day. Weigh three signals per question: the MCQ (recognition), the written explanation (depth of understanding — a right MCQ with a shallow explanation = half-understanding, NOT ready), and the deeper follow-up MCQs (whether they hold up when the concept is probed from other angles — strong follow-up scores are good corroborating evidence, weak ones expose shallow grasp). Read all of this IN THE CONTEXT of their history trend. Rules: default to 'hold'. Only 'advance' when a skill is marked ELIGIBLE and the trend shows consistently strong, deep understanding sustained over multiple sessions — genuine confidence, not one good day. Only 'downgrade' if their answers reveal clearly broken basics (this may happen even before eligibility). Be conservative: it is better to hold and keep building confidence than to move too early. Return JSON only.",
        },
        {
          role: "user",
          content: `Model of the learner so far:
Narrative: ${prof?.narrative || "(none yet)"}
Strengths: ${(prof?.strengths || []).join(", ") || "(none)"}
Gaps: ${(prof?.gaps || []).join(", ") || "(none)"}

Per-skill cumulative record (judge the TREND, not just today):
${historyBlock}

Today's session transcript (each question shows its level, MCQ result, and their written answer):
${transcript}

For EACH skill practiced, decide a verdict. Advance ONLY if the skill is ELIGIBLE and the cumulative trend earns it. Otherwise hold (or downgrade if basics are broken). Return JSON:
{"narrative":"2-4 sentence updated portrait of how they think and where they are","strengths":["specific"],"gaps":["specific"],"misconceptions":[{"topic":"","note":""}],"per_skill":[{"skill":"skill_key","understanding":<0-100>,"verdict":"advance|hold|downgrade","reasoning":"one sentence WHY, referencing the trend and today's answer"}]}`,
        },
      ],
      { model: modelFor("judge"), json: true, temperature: 0.3, maxTokens: 1100, timeoutMs: 50000 }
    );
    analysis = JSON.parse(raw);
    // Normalize + validate each per-skill entry.
    analysis.per_skill = (analysis.per_skill || []).map((p) => {
      let u = p.understanding ?? 0;
      if (u > 0 && u <= 1) u = u * 100;
      const verdict: Verdict =
        p.verdict === "advance" || p.verdict === "downgrade" ? p.verdict : "hold";
      return {
        skill: p.skill,
        understanding: Math.max(0, Math.min(100, Math.round(u))),
        verdict,
        reasoning: typeof p.reasoning === "string" ? p.reasoning.slice(0, 240) : "",
      };
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "analysis failed" }, { status: 502 });
  }

  // ---- Persist learner_profile ----
  await supabase.from("learner_profile").upsert(
    {
      user_id: user.id,
      narrative: analysis.narrative || prof?.narrative || null,
      strengths: (analysis.strengths || []).slice(0, 12),
      gaps: (analysis.gaps || []).slice(0, 12),
      misconceptions: (analysis.misconceptions || []).slice(0, 12),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  // ---- Update skill_profile: cumulative, confidence-gated, non-aggressive ----
  const todayKey = new Date().toISOString().slice(0, 10);
  const updates = (analysis.per_skill || [])
    .filter((p) => focusSkills.includes(p.skill))
    .map((p) => {
      const prev = cur.get(p.skill);
      const understanding = p.understanding;
      const prevProf = prev?.proficiency ?? 0;
      const proficiency = prev ? Math.round(prevProf * 0.6 + understanding * 0.4) : understanding;
      let level = prev?.level ?? 1;
      const atLevel = (prev?.sessions_at_level ?? 0) + 1; // this session counts

      // GATE: advancing requires enough accumulated sessions at this level.
      const eligible = atLevel >= MIN_SESSIONS_TO_MOVE;
      let effectiveVerdict = p.verdict;
      let moved = false;
      if (p.verdict === "advance" && eligible && level < 5) {
        level += 1;
        moved = true;
      } else if (p.verdict === "downgrade" && level > 1) {
        // Downgrades are allowed even before eligibility (broken basics = act now).
        level -= 1;
        moved = true;
      } else {
        // Not eligible to advance, or "hold" → stay and keep accumulating.
        if (p.verdict === "advance" && !eligible) effectiveVerdict = "hold";
      }

      // Roll the history (cap 12), and reset the at-level counter on any move.
      const history = [...(((prev?.history as any[]) || []))];
      history.push({
        date: todayKey,
        level: prev?.level ?? 1,
        understanding,
        verdict: effectiveVerdict,
        note: (p.reasoning || "").slice(0, 120),
      });
      while (history.length > 12) history.shift();

      const seenThis = questions.filter((q) => q.skill === p.skill).length;
      const correctThis = questions.filter(
        (q, i) => q.skill === p.skill && responses.find((r) => r.qi === i)?.mcq_correct
      ).length;
      return {
        user_id: user.id,
        skill: p.skill,
        level,
        proficiency,
        sessions_at_level: moved ? 0 : atLevel,
        history,
        seen: (prev?.seen ?? 0) + seenThis,
        correct: (prev?.correct ?? 0) + correctThis,
        updated_at: new Date().toISOString(),
      };
    });
  if (updates.length) {
    await supabase.from("skill_profile").upsert(updates, { onConflict: "user_id,skill" });
  }

  // ---- Advance curriculum: mark strongly-understood topics as mastered ----
  const strongSkills = new Set(
    (analysis.per_skill || []).filter((p) => p.understanding >= 80).map((p) => p.skill)
  );
  if (strongSkills.size > 0) {
    const { data: topics } = await supabase
      .from("curriculum")
      .select("id, skill, status, mastery")
      .eq("user_id", user.id)
      .in("skill", [...strongSkills]);
    for (const t of topics || []) {
      const p = (analysis.per_skill || []).find((x) => x.skill === t.skill);
      const mastery = Math.max(t.mastery, p?.understanding ?? 0);
      await supabase
        .from("curriculum")
        .update({
          mastery,
          status: mastery >= 85 ? "mastered" : t.status === "planned" ? "active" : t.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", t.id);
    }
  }

  return NextResponse.json({
    status: "processed",
    narrative: analysis.narrative,
    leveled: updates
      .filter((u) => (cur.get(u.skill)?.level ?? 1) < u.level)
      .map((u) => SKILL_LABEL[u.skill] || u.skill),
    downgraded: updates
      .filter((u) => (cur.get(u.skill)?.level ?? 1) > u.level)
      .map((u) => SKILL_LABEL[u.skill] || u.skill),
    verdicts: analysis.per_skill.map((p) => ({
      skill: SKILL_LABEL[p.skill] || p.skill,
      verdict: p.verdict,
      reasoning: p.reasoning,
    })),
  });
}
