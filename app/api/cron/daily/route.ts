import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chat } from "@/lib/openrouter";
import { BRAIN_CATEGORIES, nextCategory } from "@/lib/brain-gym";
import { yesterdayKey } from "@/lib/daily-article";

export const runtime = "nodejs";
// Dispatcher: fast content + chat-memory rollups. Article generation is fanned
// out to /api/cron/article (one invocation per user), so this stays quick.
export const maxDuration = 60;

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

  // ---- Per-user rollups ----
  const { data: profiles } = await admin.from("profiles").select("id");
  const userIds = (profiles || []).map((p) => p.id).filter(Boolean);

  // The chat-memory summary is fast — do it inline for everyone.
  let summaryOk = 0;
  for (const userId of userIds) {
    try {
      if ((await summarizeYesterday(admin, userId)) === "ok") summaryOk++;
    } catch {
      /* skip this user, keep going */
    }
  }

  // The deep article is heavy — DISPATCH one invocation per user so each gets a
  // fresh 60s budget (free-tier-safe past one active user). Fire-and-forget:
  // we only need to skip users with no activity yesterday to avoid waking the
  // worker for nothing. Idempotency in the worker makes a re-dispatch harmless.
  const dayKey = yesterdayKey();
  const dayStart = `${dayKey}T00:00:00.000Z`;
  const dayEnd = `${dayKey}T23:59:59.999Z`;
  let dispatched = 0;
  const base = originFrom(req);
  const secret = process.env.CRON_SECRET;
  for (const userId of userIds) {
    // Cheap pre-check: only dispatch if the user did something yesterday.
    const [{ count: sCount }, { count: lCount }] = await Promise.all([
      admin
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("session_date", dayKey),
      admin
        .from("learn_articles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd),
    ]);
    if (!sCount && !lCount) continue;

    // Fire-and-forget: don't await the heavy work — it runs in its own invocation.
    void fetch(`${base}/api/cron/article`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ userId }),
    }).catch(() => {});
    dispatched++;
  }

  results.users = String(userIds.length);
  results.summary = `${summaryOk}/${userIds.length}`;
  results.articlesDispatched = String(dispatched);

  return NextResponse.json({ date: today, results });
}

// Best-effort origin for calling our own sibling endpoint. Prefers an explicit
// site URL, falls back to the incoming request's host.
function originFrom(req: Request): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (site) return site.startsWith("http") ? site : `https://${site}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
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
