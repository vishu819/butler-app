import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 90;

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
            ? "You explain classic computer-science papers to a senior engineer studying to be an architect. Read the paper at the given URL and write a THOROUGH, detailed study guide in Markdown (aim for 700-900 words). Use these sections:\n## Overview — 2-3 sentences on what the paper introduces and the problem it solves.\n## The problem — what was broken/hard before this work, with concrete context.\n## Key ideas — 5-8 bullets, each explaining a core concept or mechanism in depth (not just naming it — explain HOW it works and WHY it matters).\n## How it works — a walkthrough of the actual technique/algorithm/architecture, step by step.\n## Tradeoffs & limitations — what it sacrifices, when it breaks down, criticisms.\n## Why architects care — concrete lessons and where these ideas show up in real systems today (name real systems).\n## In one sentence — the crisp takeaway.\nBe specific and technical. Prefer real detail over hand-waving. No filler."
            : "You summarize engineering-blog articles for a senior engineer studying to be an architect. Read the article at the given URL and write a THOROUGH, detailed breakdown in Markdown (aim for 700-900 words). Use these sections:\n## Overview — 2-3 sentences on what the article is about and the context.\n## The problem — what challenge/incident/scale pressure prompted this work.\n## Key ideas — 5-8 bullets, each explaining a decision, technique, or insight in depth (explain the reasoning, not just the what).\n## How they did it — a walkthrough of the actual approach, architecture, or solution.\n## Tradeoffs & what they'd change — costs, limitations, lessons learned, what didn't work.\n## Architecture lessons — generalizable principles an architect should take away, and where they apply elsewhere.\n## In one sentence — the crisp takeaway.\nBe specific and technical. Prefer real detail and real numbers over hand-waving. No filler.",
        },
        {
          role: "user",
          content: `Summarize this ${isPaper ? "paper" : "article"}: "${title || url}"\nURL: ${url}`,
        },
      ],
      { model: modelFor("web"), online: true, maxTokens: 2000, timeoutMs: 75000 }
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
      .then(() => { });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ summary, cached: false });
}