import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    concept: string;
    correct: number;
  }[];

  let score = 0;
  const weak: string[] = [];
  const perQ = questions.map((q, i) => {
    const isCorrect = chosen[i] === q.correct;
    if (isCorrect) score++;
    else weak.push(q.concept);
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

  return NextResponse.json({ score, total: questions.length, perQ, weak_concepts: weak });
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
