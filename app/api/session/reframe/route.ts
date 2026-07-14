import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { qi } -> reword the same question ("didn't get it"). Same concept + difficulty,
// just rephrased in case the wording was the barrier.
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
  const { qi } = body;
  const today = new Date().toISOString().slice(0, 10);

  const { data: session } = await supabase
    .from("sessions")
    .select("id, questions")
    .eq("user_id", user.id)
    .eq("session_date", today)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "no session" }, { status: 404 });

  const questions = session.questions as any[];
  const q = questions[qi];
  if (!q) return NextResponse.json({ error: "bad question index" }, { status: 400 });

  try {
    const raw = await chat(
      [
        {
          role: "system",
          content:
            "You reword a quiz question to make it clearer WITHOUT changing its difficulty, concept, or the correct answer. Keep the same 4 options (you may lightly rephrase them) and the SAME correct answer meaning. The goal is only to fix confusing wording. Return JSON only.",
        },
        {
          role: "user",
          content: `Original question: ${q.question}
Options: ${JSON.stringify(q.options)}
Correct index: ${q.correct}
Concept: ${q.concept}

Reword it clearly. Return JSON: {"question":"reworded","options":["A","B","C","D"],"correct":<index of the same correct answer>,"followup_prompt":"reworded follow-up"}`,
        },
      ],
      { json: true, temperature: 0.5, maxTokens: 700, timeoutMs: 30000 }
    );
    const r = JSON.parse(raw);
    if (
      typeof r.question !== "string" ||
      !Array.isArray(r.options) ||
      r.options.length !== 4 ||
      !Number.isInteger(r.correct)
    ) {
      throw new Error("bad reword");
    }

    // Persist the reworded question in place (keep explanation/skill/level).
    const updated = { ...q, question: r.question, options: r.options, correct: r.correct, followup_prompt: r.followup_prompt || q.followup_prompt };
    const nextQuestions = [...questions];
    nextQuestions[qi] = updated;
    await supabase.from("sessions").update({ questions: nextQuestions }).eq("id", session.id);

    return NextResponse.json({
      question: {
        skill: updated.skill,
        level: updated.level,
        concept: updated.concept,
        question: updated.question,
        options: updated.options,
        followup_prompt: updated.followup_prompt,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "reframe failed" }, { status: 502 });
  }
}
