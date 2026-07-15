import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatStream } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 90; // :online web search + streaming article

// POST { concept, question? } -> streams a summarized study article, saves it after.
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
  const { concept, question } = body;
  if (!concept) return NextResponse.json({ error: "concept required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let article = "";
      try {
        for await (const chunk of chatStream(
          [
            {
              role: "system",
              content:
                "You are a software-engineering tutor writing a concise study article for an engineer who wants to go deep. Teach the concept clearly and practically. Use short Markdown: a one-line summary, a '## Key ideas' bulleted section, a '## In practice' section with a concrete example or tradeoff, and a '## Remember' one-liner. Then finish with a '## Go deeper' section: 3-5 of the BEST real resources to advance on this concept — canonical papers, seminal blog posts, official docs, or standout talks. USE WEB SEARCH to find real, current, high-quality links. Format each as a Markdown link '[Title — source](https://url)' with a 4-8 word note on why it's worth reading. Only include links you are confident are real and on-topic. Keep the whole article under ~450 words.",
            },
            {
              role: "user",
              content: `Write a study article on the concept: "${concept}".${
                question ? ` It came up in this quiz question: "${question}".` : ""
              } Focus on what an engineer must understand about it, and end with the best real links to learn more.`,
            },
          ],
          { model: modelFor("web"), online: true, timeoutMs: 60000 }
        )) {
          article += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch {
        if (!article) {
          controller.enqueue(
            encoder.encode("Sorry — couldn't generate this article. Please try again.")
          );
        }
      } finally {
        controller.close();
      }

      // Persist the finished article (best-effort).
      if (article.trim()) {
        try {
          await supabase
            .from("learn_articles")
            .insert({ user_id: user.id, concept, question: question || null, article });
        } catch {
          // ignore persistence errors — the user already saw the article
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

// GET -> saved articles (the knowledge library)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("learn_articles")
    .select("id, concept, article, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ articles: data || [] });
}

// DELETE { id } -> remove a saved article from the library.
export async function DELETE(req: Request) {
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
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase
    .from("learn_articles")
    .delete()
    .eq("id", body.id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
