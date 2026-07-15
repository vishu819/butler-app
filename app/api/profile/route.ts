import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SKILL_LABEL } from "@/lib/skills";
import { skillKeysForRole } from "@/lib/roles";

export const runtime = "nodejs";

// GET -> the user's skill map for THEIR role (every role skill, defaults for
// untested ones).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data }, { data: profileRow }] = await Promise.all([
    supabase
      .from("skill_profile")
      .select("skill, level, proficiency, seen, correct")
      .eq("user_id", user.id),
    supabase.from("profiles").select("target_role").eq("id", user.id).maybeSingle(),
  ]);
  const rows = new Map((data || []).map((r) => [r.skill, r]));
  const roleSkillKeys = skillKeysForRole(profileRow?.target_role);

  const skills = roleSkillKeys.map((key) => {
    const r = rows.get(key);
    return {
      key,
      label: SKILL_LABEL[key] || key,
      level: r?.level ?? 1,
      proficiency: r?.proficiency ?? 0,
      seen: r?.seen ?? 0,
      correct: r?.correct ?? 0,
    };
  });

  // Summary stats for the header.
  const tested = skills.filter((s) => s.seen > 0);
  const progress =
    tested.length > 0
      ? Math.round(tested.reduce((sum, s) => sum + s.proficiency, 0) / tested.length)
      : 0;
  const rating = Math.round((progress / 20) * 10) / 10; // 0-100 -> 0-5, 1 decimal

  // Streak: consecutive days (up to today) with any quiz result.
  const { data: qdates } = await supabase
    .from("quiz_results")
    .select("quiz_date")
    .eq("user_id", user.id)
    .order("quiz_date", { ascending: false })
    .limit(60);
  const dateSet = new Set((qdates || []).map((r) => r.quiz_date));
  let streak = 0;
  const d = new Date();
  // Allow the streak to count from today or yesterday (grace for "not done yet today").
  if (!dateSet.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  while (dateSet.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }

  // Extra tiles: total questions answered, brain-gym sessions, 7-day activity.
  const totalQuestions = skills.reduce((s, k) => s + k.seen, 0);
  const totalCorrect = skills.reduce((s, k) => s + k.correct, 0);
  const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const { count: gymCount } = await supabase
    .from("brain_gym_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Last 7 days activity (quiz taken that day) for a mini bar strip.
  const week: { date: string; active: boolean }[] = [];
  const today0 = new Date();
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(today0);
    dt.setUTCDate(dt.getUTCDate() - i);
    const key = dt.toISOString().slice(0, 10);
    week.push({ date: key, active: dateSet.has(key) });
  }

  return NextResponse.json({
    skills,
    stats: {
      progress,
      rating,
      streak,
      assessed: tested.length,
      total: skills.length,
      totalQuestions,
      accuracy,
      gymSessions: gymCount || 0,
      week,
    },
  });
}
