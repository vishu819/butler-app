import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tolerant parse: models sometimes wrap JSON in ```fences``` or add prose.
function parseJudge(raw: string): { score?: number; feedback?: string } | null {
  if (!raw) return null;
  let txt = raw.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) txt = fence[1].trim();
  try {
    return JSON.parse(txt);
  } catch {
    // Grab the first {...} block if there's surrounding prose.
    const obj = txt.match(/\{[\s\S]*\}/);
    if (obj) {
      try {
        return JSON.parse(obj[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// POST { qi, chosen, followup } -> grade one question (MCQ + LLM-judged follow-up).
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
  const { qi, chosen, followup } = body;
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

  const mcqCorrect = chosen === q.correct;

  // LLM judges the typed follow-up answer.
  let judge = { score: 0, feedback: "" };
  if (followup && typeof followup === "string" && followup.trim()) {
    try {
      const raw = await chat(
        [
          {
            role: "system",
            content:
              "You are a staff-level architect grading a mentee's short answer to a follow-up question. Be encouraging but precise. Score 0-100 for depth + correctness. Give 1-2 sentences of feedback: what was right, what was missing. Return JSON only.",
          },
          {
            role: "user",
            content: `Concept: ${q.concept}
MCQ: ${q.question}
Correct MCQ answer: ${q.options[q.correct]}
Follow-up question: ${q.followup_prompt}
Reference (the principle): ${q.explanation}

Mentee's typed answer: "${followup}"

Return JSON: {"score": <0-100>, "feedback": "1-2 sentences"}`,
          },
        ],
        { model: modelFor("judge"), json: true, temperature: 0.3, maxTokens: 200, timeoutMs: 30000 }
      );
      const parsed = parseJudge(raw);
      if (parsed) {
        judge = { score: Math.max(0, Math.min(100, parsed.score ?? 0)), feedback: parsed.feedback || "" };
      } else {
        judge = { score: mcqCorrect ? 60 : 30, feedback: "Answer saved — automatic grading was unavailable this time." };
      }
    } catch {
      judge = { score: mcqCorrect ? 60 : 30, feedback: "Answer saved — automatic grading was unavailable this time." };
    }
  }

  const response = {
    qi,
    chosen: chosen ?? null,
    followup_text: followup || "",
    mcq_correct: mcqCorrect,
    followup_score: judge.score,
    feedback: judge.feedback,
  };

  // Merge into responses (replace if re-answered).
  const responses = ((session.responses as any[]) || []).filter((r) => r.qi !== qi);
  responses.push(response);
  const status = responses.length >= questions.length ? "complete" : "active";

  await supabase.from("sessions").update({ responses, status }).eq("id", session.id);

  // Return full question detail now that it's answered (correct + explanation).
  return NextResponse.json({
    response,
    reveal: { correct: q.correct, explanation: q.explanation },
    complete: status === "complete",
  });
}