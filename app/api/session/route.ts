import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickFocusSkills, generateSession, gatherWebContext } from "@/lib/session-gen";

export const runtime = "nodejs";
export const maxDuration = 60;

const PER_SKILL = 2; // ~2 questions each × 2 sectors ≈ 4-5 per day

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
      : { skill: q.skill, level: q.level, concept: q.concept, question: q.question, options: q.options, followup_prompt: q.followup_prompt }
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

  const { data: skillRows } = await supabase
    .from("skill_profile")
    .select("skill, level, proficiency, seen")
    .eq("user_id", user.id);
  // Reinforce the single weakest area (the "new concept" provides breadth).
  const focus = pickFocusSkills(skillRows || [], 1);

  // Pick the next NEW concept: an unmastered curriculum topic not yet introduced.
  const { data: topics } = await supabase
    .from("curriculum")
    .select("topic, skill, status, position")
    .eq("user_id", user.id)
    .neq("status", "mastered")
    .order("position")
    .limit(1);
  const newTopic = topics && topics[0] ? { topic: topics[0].topic, skill: topics[0].skill } : null;

  try {
    // Web-ground the questions in real failure cases (best-effort).
    const webContext = await gatherWebContext(focus);
    const questions = await generateSession(focus, PER_SKILL, webContext, newTopic);
    if (questions.length === 0) {
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
