import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { url, title, kind } -> a short summary of a paper/article.
// Cached by URL in feed_summaries so re-open is instant.
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
  const { url, title, kind } = body || {};
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  // Return cache if we have it.
  const { data: cached } = await supabase
    .from("feed_summaries")
    .select("summary")
    .eq("url", url)
    .maybeSingle();
  if (cached?.summary) return NextResponse.json({ summary: cached.summary, cached: true });

  const isPaper = kind === "paper";
  let summary = "";
  try {
    summary = await chat(
      [
        {
          role: "system",
          content: isPaper
            ? "You explain classic computer-science papers to a senior engineer studying to be an architect. Read the paper at the given URL. Write concise Markdown: a one-line summary, a '## Key ideas' bulleted section (3-5 bullets), a '## Why architects care' section, and a '## In one sentence' takeaway. Under ~300 words. No fluff."
            : "You summarize engineering-blog articles for a senior engineer studying to be an architect. Read the article at the given URL. Write concise Markdown: a one-line summary, a '## Key ideas' bulleted section (3-5 bullets), a '## Architecture lesson' section, and a '## In one sentence' takeaway. Under ~300 words. No fluff.",
        },
        {
          role: "user",
          content: `Summarize this ${isPaper ? "paper" : "article"}: "${title || url}"\nURL: ${url}`,
        },
      ],
      { model: modelFor("web"), online: true, maxTokens: 700, timeoutMs: 50000 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "summary failed" }, { status: 502 });
  }

  if (!summary.trim()) return NextResponse.json({ error: "empty summary" }, { status: 502 });

  // Cache globally (admin bypasses RLS).
  try {
    createAdminClient()
      .from("feed_summaries")
      .upsert({ url, title: title || null, kind: isPaper ? "paper" : "article", summary }, { onConflict: "url" })
      .then(() => {});
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ summary, cached: false });
}
