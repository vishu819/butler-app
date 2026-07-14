import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SKILL_KEYS } from "@/lib/skills";

export const runtime = "nodejs";

// POST { chosen: number[] } -> grades today's quiz, saves result, returns per-question correctness.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { chosen } = await req.json();
  if (!Array.isArray(chosen)) {
    return NextResponse.json({ error: "chosen[] required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: qc } = await supabase
    .from("daily_content")
    .select("payload")
    .eq("content_date", today)
    .eq("type", "eng_q")
    .single();
  if (!qc) return NextResponse.json({ error: "no quiz for today" }, { status: 404 });

  const questions = ((qc.payload as any)?.questions || []) as {
    skill?: string;
    concept: string;
    correct: number;
  }[];

  let score = 0;
  const weak: string[] = [];
  // Tally per-skill results this quiz.
  const bySkill = new Map<string, { seen: number; correct: number }>();
  const perQ = questions.map((q, i) => {
    const isCorrect = chosen[i] === q.correct;
    if (isCorrect) score++;
    else weak.push(q.concept);
    if (q.skill && SKILL_KEYS.includes(q.skill)) {
      const s = bySkill.get(q.skill) || { seen: 0, correct: 0 };
      s.seen++;
      if (isCorrect) s.correct++;
      bySkill.set(q.skill, s);
    }
    return { qi: i, chosen: chosen[i] ?? null, correct: q.correct, isCorrect };
  });

  const { error } = await supabase.from("quiz_results").upsert(
    {
      user_id: user.id,
      quiz_date: today,
      score,
      total: questions.length,
      answers: perQ,
      weak_concepts: weak,
    },
    { onConflict: "user_id,quiz_date" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update the adaptive skill profile (best-effort; doesn't block the response).
  await updateSkillProfile(supabase, user.id, bySkill);

  return NextResponse.json({ score, total: questions.length, perQ, weak_concepts: weak });
}

// Update per-skill proficiency + adaptive level from one quiz's results.
type DbClient = Awaited<ReturnType<typeof createClient>>;
async function updateSkillProfile(
  supabase: DbClient,
  userId: string,
  bySkill: Map<string, { seen: number; correct: number }>
) {
  if (bySkill.size === 0) return;
  const skills = [...bySkill.keys()];
  const { data: existing } = await supabase
    .from("skill_profile")
    .select("skill, level, proficiency, seen, correct")
    .eq("user_id", userId)
    .in("skill", skills);
  const cur = new Map((existing || []).map((r) => [r.skill, r]));

  const rows = skills.map((skill) => {
    const res = bySkill.get(skill)!;
    const prev = cur.get(skill);
    const prevProf = prev?.proficiency ?? 0;
    const prevLevel = prev?.level ?? 1;
    const roundRate = Math.round((res.correct / res.seen) * 100);
    // Exponential moving average so the profile adapts but isn't jumpy.
    const proficiency = prev
      ? Math.round(prevProf * 0.6 + roundRate * 0.4)
      : roundRate;
    // Level up when consistently strong, down when weak. Clamp 1..5.
    let level = prevLevel;
    if (proficiency >= 80 && level < 5) level++;
    else if (proficiency < 45 && level > 1) level--;
    return {
      user_id: userId,
      skill,
      level,
      proficiency,
      seen: (prev?.seen ?? 0) + res.seen,
      correct: (prev?.correct ?? 0) + res.correct,
      updated_at: new Date().toISOString(),
    };
  });

  await supabase.from("skill_profile").upsert(rows, { onConflict: "user_id,skill" });
}

// GET -> today's saved result (if any)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("quiz_results")
    .select("score, total, answers, weak_concepts")
    .eq("user_id", user.id)
    .eq("quiz_date", today)
    .maybeSingle();

  return NextResponse.json({ result: data });
}
