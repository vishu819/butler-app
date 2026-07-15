import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST { qi, fu_picks } -> record the learner's follow-up MCQ picks on an
// already-answered question, WITHOUT re-running the LLM grade. Follow-up MCQs are
// answered in the review phase (after the typed answer), so they arrive later and
// must be merged into the existing response. Graded locally from stored answers.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { qi, fu_picks } = body || {};
  if (qi === undefined || !fu_picks || typeof fu_picks !== "object") {
    return NextResponse.json({ error: "qi and fu_picks required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: session } = await supabase
    .from("sessions")
    .select("id, questions, responses")
    .eq("user_id", user.id)
    .eq("session_date", today)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "no session" }, { status: 404 });

  const questions = session.questions as any[];
  const q = questions[qi];
  if (!q) return NextResponse.json({ error: "bad question index" }, { status: 400 });

  const responses = (session.responses as any[]) || [];
  const existing = responses.find((r) => r.qi === qi);
  if (!existing) {
    // Follow-ups can only be recorded after the main answer exists.
    return NextResponse.json({ error: "answer the question first" }, { status: 409 });
  }

  const fuList: any[] = Array.isArray(q.followup_mcqs) ? q.followup_mcqs : [];
  const fuTotal = fuList.length;
  let fuCorrect = 0;
  for (let i = 0; i < fuList.length; i++) {
    if (fu_picks[i] !== undefined && fu_picks[i] === fuList[i].correct) fuCorrect++;
  }

  const updated = { ...existing, fu_picks, fu_correct: fuCorrect, fu_total: fuTotal };
  const next = responses.filter((r) => r.qi !== qi);
  next.push(updated);
  await supabase.from("sessions").update({ responses: next }).eq("id", session.id);

  // Return the graded follow-up MCQs (correct index + explanation) so the client
  // can reveal ✓/✗ + why immediately — without a refetch. The main question is
  // already answered here, so revealing the follow-up answers isn't a peek.
  return NextResponse.json({
    ok: true,
    fu_correct: fuCorrect,
    fu_total: fuTotal,
    followup_mcqs: fuList.map((m: any) => ({
      q: m.q,
      options: m.options,
      correct: m.correct,
      explanation: m.explanation,
    })),
  });
}
