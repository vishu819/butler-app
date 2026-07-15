import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickFocusSkills, generateSession } from "@/lib/session-gen";
import { roleFor, skillKeysForRole } from "@/lib/roles";

export const runtime = "nodejs";
export const maxDuration = 120; // web-grounded generation (search + large gen) can exceed 60s

// Shorter daily session: at least TARGET questions. Normally 3 reinforcement
// (1 each on 3 focus skills) + 1 new concept = 4. If there's no new concept to
// introduce (plan not built yet, or everything mastered), we pick a 4th focus
// skill instead so the session is never short.
const PER_SKILL = 1;
const TARGET = 4;

// GET -> today's session (without the correct answers / explanations pre-reveal).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("sessions")
    .select("id, focus_skills, questions, responses, status")
    .eq("user_id", user.id)
    .eq("session_date", today)
    .maybeSingle();

  if (!data) return NextResponse.json({ session: null });

  // Strip correct/explanation from unanswered questions so the client can't peek.
  const responses = (data.responses || []) as any[];
  const answered = new Set(responses.map((r) => r.qi));
  const questions = (data.questions as any[]).map((q, i) =>
    answered.has(i)
      ? q
      : {
          skill: q.skill,
          level: q.level,
          concept: q.concept,
          question: q.question,
          options: q.options,
          followup_prompt: q.followup_prompt,
          // Follow-up MCQs: send question + options, strip correct/explanation.
          followup_mcqs: Array.isArray(q.followup_mcqs)
            ? q.followup_mcqs.map((m: any) => ({ q: m.q, options: m.options }))
            : [],
        }
  );

  return NextResponse.json({
    session: { id: data.id, focus_skills: data.focus_skills, questions, responses, status: data.status },
  });
}

// POST -> generate today's session (idempotent). Picks 2 weakest sectors.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", user.id)
    .eq("session_date", today)
    .maybeSingle();
  if (existing) return NextResponse.json({ status: "exists" });

  // Target role decides which skills this learner trains + how deep they go.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("target_role")
    .eq("id", user.id)
    .maybeSingle();
  const role = roleFor(profileRow?.target_role);
  const roleSkillKeys = skillKeysForRole(profileRow?.target_role);

  const { data: allSkillRows } = await supabase
    .from("skill_profile")
    .select("skill, level, proficiency, seen")
    .eq("user_id", user.id);
  // Only consider skills that belong to the learner's role.
  const skillRows = (allSkillRows || []).filter((r) => roleSkillKeys.includes(r.skill));

  // Broad coverage: what did recent sessions already cover? Deprioritize those
  // so all competencies cycle over ~a week, while still weighting toward weak areas.
  const { data: recentSessions } = await supabase
    .from("sessions")
    .select("focus_skills")
    .eq("user_id", user.id)
    .order("session_date", { ascending: false })
    .limit(3);
  const recentlyCovered = (recentSessions || []).flatMap((s) => s.focus_skills || []);

  // The learning PATH drives the session. Pull the unmastered curriculum tail:
  //  - `active` topics = what they're currently working through → reinforce these
  //  - the first `planned` topic = the next NEW concept to introduce
  const { data: topics } = await supabase
    .from("curriculum")
    .select("topic, skill, status, rationale, position")
    .eq("user_id", user.id)
    .neq("status", "mastered")
    .order("position")
    .limit(8);
  const active = (topics || []).filter((t) => t.status === "active");
  const firstPlanned = (topics || []).find((t) => t.status === "planned");
  // Anchor reinforcement to the 2-3 active path topics (fallback: none → pure weakness).
  const pathTopics = active.slice(0, 3).map((t) => ({
    topic: t.topic,
    skill: t.skill as string,
    rationale: (t.rationale as string) || "",
  }));
  const newTopic = firstPlanned
    ? { topic: firstPlanned.topic, skill: firstPlanned.skill }
    : null;

  // Keep the session at TARGET questions: the new concept counts as one, so we
  // need (TARGET - 1) focus skills when there's a new topic, else TARGET.
  const focusCount = newTopic ? TARGET - 1 : TARGET;

  // Pick focus skills from THIS role's set only, clamped to the role's ceiling.
  const focus = pickFocusSkills(skillRows, focusCount, recentlyCovered, roleSkillKeys).map(
    (f) => ({ ...f, level: Math.min(f.level, role.ceiling) })
  );

  try {
    // The generation call is web-grounded (:online) — it pulls real incidents
    // itself, so no separate web-context pre-fetch is needed.
    const questions = await generateSession(focus, PER_SKILL, undefined, newTopic, pathTopics, role.framing);
    if (questions.length === 0) {
      console.error("[session] generation returned 0 questions (focus:", focus.map((f) => f.key).join(","), ")");
      return NextResponse.json({ error: "Couldn't build a session. Try again." }, { status: 502 });
    }
    // Mark the introduced topic as active so it isn't re-picked as "new".
    if (newTopic) {
      await supabase
        .from("curriculum")
        .update({ status: "active" })
        .eq("user_id", user.id)
        .eq("topic", newTopic.topic)
        .eq("status", "planned");
    }
    const focusKeys = [...new Set([...focus.map((f) => f.key), ...(newTopic ? [newTopic.skill] : [])])];
    const { error } = await supabase.from("sessions").insert({
      user_id: user.id,
      session_date: today,
      focus_skills: focusKeys,
      questions,
      responses: [],
      status: "active",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      status: "generated",
      focus: focus.map((f) => f.label),
      newConcept: newTopic?.topic || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "generation failed" }, { status: 502 });
  }
}
