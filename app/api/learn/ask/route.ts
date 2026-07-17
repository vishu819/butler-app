import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatStream } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 90; // grounded answer + optional web search + streaming

// POST { learn_date, question, selection? } -> streams an answer grounded in that
// day's deep-dive article, then saves the Q&A. GET ?learn_date= -> prior thread.
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
  const { learn_date, question, selection } = body || {};
  if (!learn_date || !question?.trim()) {
    return NextResponse.json({ error: "learn_date and question required" }, { status: 400 });
  }

  // Load the article this question is about, to ground the answer.
  const { data: row } = await supabase
    .from("daily_learning")
    .select("article, summary")
    .eq("user_id", user.id)
    .eq("learn_date", learn_date)
    .maybeSingle();
  if (!row?.article && !row?.summary) {
    return NextResponse.json({ error: "no article for that day" }, { status: 404 });
  }
  // Cap grounding context so a huge article doesn't blow the token budget.
  const context = (row.article || row.summary || "").slice(0, 9000);
  const sel = typeof selection === "string" ? selection.slice(0, 1000).trim() : "";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let answer = "";
      try {
        for await (const chunk of chatStream(
          [
            {
              role: "system",
              content:
                "You are Butler, a deep, patient engineering mentor. The learner is reading a study article (given below) and is asking a follow-up. Answer their question thoroughly and concretely, GROUNDED in the article's context but going beyond it where it helps them truly understand — tradeoffs, edge cases, worked examples, short code where it clarifies. If they highlighted a specific passage, focus your answer on that. You MAY use web search to add current, authoritative references; when you do, cite them as Markdown links '[Title — source](url)'. Use concise Markdown. Don't restate the whole article — answer the question.",
            },
            {
              role: "user",
              content: `ARTICLE CONTEXT (what they're reading):\n${context}\n\n${
                sel ? `They highlighted this passage:\n"""${sel}"""\n\n` : ""
              }Their question: ${question.trim()}`,
            },
          ],
          { model: modelFor("web"), online: true, timeoutMs: 70000 }
        )) {
          answer += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch {
        if (!answer) {
          controller.enqueue(encoder.encode("Sorry — couldn't answer that. Please try again."));
        }
      } finally {
        controller.close();
      }

      if (answer.trim()) {
        try {
          await supabase.from("article_questions").insert({
            user_id: user.id,
            learn_date,
            selection: sel || null,
            question: question.trim(),
            answer,
          });
        } catch {
          // ignore persistence errors — the user already saw the answer
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

// GET ?learn_date=YYYY-MM-DD -> the saved Q&A thread for that day's article.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const learn_date = searchParams.get("learn_date");
  if (!learn_date) return NextResponse.json({ error: "learn_date required" }, { status: 400 });

  const { data } = await supabase
    .from("article_questions")
    .select("id, selection, question, answer, created_at")
    .eq("user_id", user.id)
    .eq("learn_date", learn_date)
    .order("created_at", { ascending: true });

  return NextResponse.json({ questions: data || [] });
}
