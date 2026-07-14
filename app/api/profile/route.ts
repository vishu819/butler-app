import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SKILLS } from "@/lib/skills";

export const runtime = "nodejs";

// GET -> the user's full skill map (every skill, with defaults for untested ones).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("skill_profile")
    .select("skill, level, proficiency, seen, correct")
    .eq("user_id", user.id);
  const rows = new Map((data || []).map((r) => [r.skill, r]));

  const skills = SKILLS.map((s) => {
    const r = rows.get(s.key);
    return {
      key: s.key,
      label: s.label,
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

  return NextResponse.json({
    skills,
    stats: { progress, rating, streak, assessed: tested.length, total: skills.length },
  });
}
