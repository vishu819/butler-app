import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chat, chatWithMeta } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { BRAIN_CATEGORIES, nextCategory } from "@/lib/brain-gym";

export const runtime = "nodejs";
// The deep daily article is a heavy LLM call; give it room. On Vercel Hobby the
// effective cap is 60s — the article prompt is structured to fit. Pro allows 300.
export const maxDuration = 60;

// Strip anything script-like from LLM-produced HTML before we store/render it.
// This is our own content on our own account (not user-to-user), but we render
// with dangerouslySetInnerHTML, so remove <script>, event handlers, and
// javascript: URLs defensively.
function sanitizeHtml(html: string): string {
  return (html || "")
    // drop code fences if the model wrapped the whole thing
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

// Generates today's content (eng_q, brain_gym, news) once and caches it.
// Protected by CRON_SECRET. Called by Vercel Cron, or manually with the header.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const admin = createAdminClient();

  // Skip anything already generated for today.
  const { data: existing } = await admin
    .from("daily_content")
    .select("type")
    .eq("content_date", today);
  const have = new Set((existing || []).map((r) => r.type));

  const results: Record<string, string> = {};
  const rows: { content_date: string; type: string; payload: unknown }[] = [];

  // (Legacy daily eng_q quiz retired — the on-demand Session is the learning loop now.)

  // ---- Brain gym (rotating category so every aspect gets trained) ----
  if (!have.has("brain_gym")) {
    try {
      // Determine the next category from the single user's recent history.
      const { data: prof } = await admin.from("profiles").select("id").limit(1).maybeSingle();
      let recent: string[] = [];
      if (prof) {
        const { data: log } = await admin
          .from("brain_gym_log")
          .select("category")
          .eq("user_id", prof.id)
          .order("created_at", { ascending: false })
          .limit(BRAIN_CATEGORIES.length);
        recent = (log || []).map((l) => l.category);
      }
      const category = nextCategory(recent);
      const cat = BRAIN_CATEGORIES.find((c) => c.key === category)!;

      const raw = await chat(
        [
          {
            role: "system",
            content: `You create one short daily brain-gym exercise in the "${cat.label}" category (${cat.desc}). It should be solvable in about ${Math.round(cat.seconds / 60)} minutes. Return JSON only.`,
          },
          {
            role: "user",
            content:
              'Return JSON: {"kind": string, "prompt": string, "answer": string, "why": string}. Make it fun and genuinely stretching, and clearly in the stated category.',
          },
        ],
        { json: true, temperature: 1.0, maxTokens: 700, timeoutMs: 30000 }
      );
      const parsed = JSON.parse(raw);
      rows.push({
        content_date: today,
        type: "brain_gym",
        payload: { ...parsed, category, seconds: cat.seconds },
      });
      results.brain_gym = `ok (${category})`;
    } catch (e: any) {
      results.brain_gym = `error: ${e.message}`;
    }
  }

  // ---- AI news (Hacker News front-page, filtered for AI) ----
  if (!have.has("news")) {
    try {
      const items = await fetchAINews();
      let digest = "";
      if (items.length) {
        digest = await chat(
          [
            {
              role: "system",
              content:
                "You are an AI-news curator. Given today's top AI-related headlines, write a crisp 4-6 bullet digest for a busy engineer. Each bullet: one line, why it matters. No preamble.",
            },
            {
              role: "user",
              content: items.map((i) => `- ${i.title} (${i.url})`).join("\n"),
            },
          ],
          { temperature: 0.5, maxTokens: 600, timeoutMs: 30000 }
        );
      }
      rows.push({
        content_date: today,
        type: "news",
        payload: { items, digest },
      });
      results.news = "ok";
    } catch (e: any) {
      results.news = `error: ${e.message}`;
    }
  }

  if (rows.length) {
    const { error } = await admin
      .from("daily_content")
      .upsert(rows, { onConflict: "content_date,type" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ---- Per-user rollups: run for EVERY user (multi-user) ----
  // Each user gets their own daily chat-memory summary + learning digest.
  const { data: profiles } = await admin.from("profiles").select("id");
  const userIds = (profiles || []).map((p) => p.id).filter(Boolean);
  let summaryOk = 0;
  let learningOk = 0;
  for (const userId of userIds) {
    try {
      if ((await summarizeYesterday(admin, userId)) === "ok") summaryOk++;
    } catch {
      /* skip this user, keep going */
    }
    try {
      if ((await summarizeLearning(admin, userId)) === "ok") learningOk++;
    } catch {
      /* skip this user, keep going */
    }
  }
  results.users = String(userIds.length);
  results.summary = `${summaryOk}/${userIds.length}`;
  results.learning = `${learningOk}/${userIds.length}`;

  return NextResponse.json({ date: today, results });
}

// Review ALL of yesterday's activity — session questions (incl. the ones missed
// or skipped), every "Learn this topic" article, and all concepts covered — and
// synthesize ONE deep, consolidated HTML study article the learner shouldn't
// miss, plus a short markdown recap teaser. Skips silently if no activity.
async function summarizeLearning(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string> {
  const now = new Date();
  const y = new Date(now);
  y.setUTCDate(y.getUTCDate() - 1);
  const dayKey = y.toISOString().slice(0, 10);
  const dayStart = `${dayKey}T00:00:00.000Z`;
  const dayEnd = `${dayKey}T23:59:59.999Z`;

  if (!userId) return "skip: no user";

  // Idempotent — already produced this day?
  const { data: existing } = await admin
    .from("daily_learning")
    .select("id")
    .eq("user_id", userId)
    .eq("learn_date", dayKey)
    .maybeSingle();
  if (existing) return "exists";

  // ---- Gather yesterday's activity from every relevant source ----

  // 1) The session: questions + which were right / wrong / never answered.
  const { data: session } = await admin
    .from("sessions")
    .select("questions, responses")
    .eq("user_id", userId)
    .eq("session_date", dayKey)
    .maybeSingle();
  const questions = ((session?.questions || []) as any[]) || [];
  const responses = ((session?.responses || []) as any[]) || [];

  // 2) "Learn this topic" clicks — articles the learner asked to go deep on.
  const { data: learnRows } = await admin
    .from("learn_articles")
    .select("concept, question, article")
    .eq("user_id", userId)
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd)
    .order("created_at", { ascending: true });
  const learnArticles = (learnRows || []) as { concept: string; question: string | null; article: string }[];

  // No activity at all yesterday → skip silently (per design).
  if (questions.length === 0 && learnArticles.length === 0) return "skip: no activity";

  // The learner's target role, to pitch the depth correctly.
  const { data: profileRow } = await admin
    .from("profiles")
    .select("target_role, name")
    .eq("id", userId)
    .maybeSingle();
  const targetRole = profileRow?.target_role || "architect";

  // ---- Build the activity brief for the LLM ----
  const answered = new Map<number, any>();
  for (const r of responses) answered.set(r.qi, r);

  let score = 0;
  const missed: string[] = [];
  const skipped: string[] = [];
  const gotRight: string[] = [];
  const qList = questions
    .map((q, i) => {
      const r = answered.get(i);
      const mcqCorrect = r?.mcq_correct;
      if (mcqCorrect) score++;
      const fuScore = r?.followup_score != null ? ` (written: ${r.followup_score}/100)` : "";
      let status: string;
      if (!r) {
        status = "NOT ANSWERED (skipped)";
        skipped.push(q.concept);
      } else if (mcqCorrect) {
        status = `got right${fuScore}`;
        gotRight.push(q.concept);
      } else {
        status = "MISSED (wrong)";
        missed.push(q.concept);
      }
      const written = r?.followup_text ? `\n  Their written answer: "${r.followup_text}"` : "";
      return `- [${q.concept}] ${q.question} (${status})\n  Correct idea: ${q.explanation}${written}`;
    })
    .join("\n");

  const learnBrief = learnArticles.length
    ? learnArticles
        .map((a) => `### ${a.concept}${a.question ? ` (from: ${a.question})` : ""}\n${(a.article || "").slice(0, 2000)}`)
        .join("\n\n")
    : "(none)";

  // ---- Heavy LLM call → deep, consolidated HTML study article ----
  // We tell the model to end with a sentinel (<!--END-->) so we can tell a
  // finished article from one the token limit cut off mid-sentence. If it's cut
  // off, we continue-generate (append the partial + ask it to resume) and stitch
  // — up to a few rounds — so the article is never left dangling.
  const END = "<!--END-->";
  const articleMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    {
      role: "system",
      content: `You are Butler, an elite mentor writing a learner's DAILY DEEP-DIVE study article — the one thing they must not skip. The learner is training toward "${targetRole}". Consolidate everything they touched yesterday into ONE cohesive, rigorous article that takes them from foundations up to ${targetRole}-level depth on exactly the concepts they engaged with — with SPECIAL FOCUS on what they got wrong or skipped (those are the gaps to close).

Write real, substantive teaching — not a recap. For each key concept: explain it from first principles, then go deep into the tradeoffs, failure modes, and real-world decisions a senior/${targetRole} engineer must reason about. Use concrete numbers, worked examples, and short code snippets where they clarify. Weave in and EXPAND the "Learn this topic" articles they opened so this becomes the single consolidated read.

Prioritise DEPTH on the concepts they missed or skipped over breadth. Focus on the 3-5 highest-leverage concepts rather than covering everything shallowly — go deep on those. Keep it tight and information-dense; no filler, no restating the question text.

Output valid semantic HTML only (no markdown, no <html>/<head>/<body> wrapper, no <script> or <style>). Use <h2>/<h3> headings, <p>, <ul>/<li>, <strong>, <em>, <code>, and <pre><code> for code blocks. Structure:
1. <h2>What you touched yesterday</h2> — a short orienting paragraph.
2. A <div> callout listing what they MISSED or SKIPPED and why it matters most.
3. One <h2> section per key concept — foundations → depth → ${targetRole}-level tradeoffs → common mistakes.
4. <h2>Don't miss this</h2> — the 5-8 highest-leverage takeaways.
When the article is fully complete, output the exact marker ${END} on its own line as the very last thing. Return ONLY the HTML (plus that final marker).`,
    },
    {
      role: "user",
      content: `Date: ${dayKey}
Session score: ${questions.length ? `${score}/${questions.length}` : "no session"}
Concepts MISSED (wrong): ${missed.join(", ") || "none"}
Concepts SKIPPED (not answered): ${skipped.join(", ") || "none"}
Concepts got right: ${gotRight.join(", ") || "none"}

=== Session questions (with the correct idea and their result) ===
${qList || "(no session)"}

=== "Learn this topic" articles they opened yesterday (consolidate & expand these) ===
${learnBrief}`,
    },
  ];

  let article = "";
  // maxDuration is 60s (Hobby); leave headroom for the summary call + insert.
  const articleDeadline = Date.now() + 50_000;
  for (let round = 0; round < 4; round++) {
    const { content, finishReason } = await chatWithMeta(articleMessages, {
      model: modelFor("generate"),
      temperature: 0.6,
      maxTokens: 4000,
      timeoutMs: 45000,
    });
    article += content;
    // Done if the model emitted the sentinel or stopped naturally.
    if (article.includes(END) || finishReason === "stop") break;
    // Only a token-limit cutoff ("length") warrants a continue; anything else, stop.
    if (finishReason !== "length") break;
    if (Date.now() > articleDeadline) break; // out of time budget — ship what we have
    // Continue from exactly where it left off.
    articleMessages.push({ role: "assistant", content });
    articleMessages.push({
      role: "user",
      content: `Continue the HTML article from exactly where you stopped — do not repeat anything already written, do not add a preamble, just resume mid-flow. Remember to end with ${END} when fully done.`,
    });
  }
  // Strip the completion sentinel before we store/render.
  article = article.split(END)[0].trimEnd();

  // Short markdown teaser (kept in `summary`) so the Library list stays scannable.
  const summary = await chat(
    [
      {
        role: "system",
        content:
          "In 2-3 sentences of plain Markdown, tease today's deep-dive: what it covers and which gap it closes. Encouraging, concrete, no preamble.",
      },
      {
        role: "user",
        content: `Missed: ${missed.join(", ") || "none"}. Skipped: ${skipped.join(", ") || "none"}. Also opened deep reads on: ${learnArticles.map((a) => a.concept).join(", ") || "none"}.`,
      },
    ],
    { temperature: 0.5, maxTokens: 200, timeoutMs: 25000 }
  ).catch(() => "Your consolidated deep-dive from yesterday's session and the topics you explored.");

  const concepts = Array.from(
    new Set([...missed, ...skipped, ...learnArticles.map((a) => a.concept), ...gotRight])
  )
    .filter(Boolean)
    .slice(0, 16);

  const { error } = await admin.from("daily_learning").insert({
    user_id: userId,
    learn_date: dayKey,
    summary: (summary || "").trim(),
    article: sanitizeHtml(article),
    concepts,
    score: questions.length ? score : null,
    total: questions.length || null,
  });
  if (error) return `error: ${error.message}`;
  return "ok";
}

// Roll up the previous day's coach conversation into one long-term memory row,
// so the coach carries continuity across days even after raw messages are pruned.
// Runs per-user (called in a loop over all profiles).
async function summarizeYesterday(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string> {
  // Yesterday's date range (UTC).
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  const dayKey = start.toISOString().slice(0, 10);

  if (!userId) return "skip: no user";

  // Already summarized this day? (idempotent)
  const tag = `[${dayKey}]`;
  const { data: existing } = await admin
    .from("memory")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "daily_summary")
    .ilike("content", `${tag}%`)
    .maybeSingle();
  if (existing) return "exists";

  // Fetch yesterday's messages.
  const { data: msgs } = await admin
    .from("chat_messages")
    .select("role, content")
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: true })
    .limit(200);
  if (!msgs || msgs.length === 0) return "skip: no chat";

  const transcript = msgs.map((m) => `${m.role}: ${m.content}`).join("\n");
  const summary = await chat(
    [
      {
        role: "system",
        content:
          "You compress a day's coaching conversation into a 2-3 sentence memory note for future context. Capture what the user worked on, any preferences/struggles/decisions revealed, and their focus. Write in third person, concise. No preamble.",
      },
      { role: "user", content: transcript.slice(0, 12000) },
    ],
    { temperature: 0.3, maxTokens: 200, timeoutMs: 30000 }
  );

  const { error } = await admin.from("memory").insert({
    user_id: userId,
    kind: "daily_summary",
    content: `${tag} ${summary.trim()}`,
  });
  if (error) return `error: ${error.message}`;
  return "ok";
}

type NewsItem = { title: string; url: string };

// Pull HN top stories, keep AI-relevant ones. Free, no API key.
async function fetchAINews(): Promise<NewsItem[]> {
  const idsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
  const ids: number[] = await idsRes.json();
  const top = ids.slice(0, 40);

  const stories = await Promise.all(
    top.map(async (id) => {
      const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      return r.json() as Promise<{ title?: string; url?: string }>;
    })
  );

  const KW = /\b(ai|llm|gpt|claude|gemini|openai|anthropic|model|neural|machine learning|ml|agent|diffusion|transformer)\b/i;
  return stories
    .filter((s) => s?.title && KW.test(s.title))
    .slice(0, 8)
    .map((s) => ({ title: s.title!, url: s.url || `https://news.ycombinator.com/item?id=` }));
}
