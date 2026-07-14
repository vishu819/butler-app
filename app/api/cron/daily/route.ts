import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chat } from "@/lib/openrouter";
import { BRAIN_CATEGORIES, nextCategory } from "@/lib/brain-gym";

export const runtime = "nodejs";
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

  // ---- Summarize yesterday's chat into a durable daily_summary memory ----
  try {
    results.summary = await summarizeYesterday(admin);
  } catch (e: any) {
    results.summary = `error: ${e.message}`;
  }

  // ---- Daily learning digest: what the user learned from yesterday's quiz ----
  try {
    results.learning = await summarizeLearning(admin);
  } catch (e: any) {
    results.learning = `error: ${e.message}`;
  }

  return NextResponse.json({ date: today, results });
}

// Review yesterday's quiz (questions + right/wrong) and write "what you learned today".
async function summarizeLearning(
  admin: ReturnType<typeof createAdminClient>
): Promise<string> {
  const now = new Date();
  const y = new Date(now);
  y.setUTCDate(y.getUTCDate() - 1);
  const dayKey = y.toISOString().slice(0, 10);

  const { data: prof } = await admin.from("profiles").select("id").limit(1).maybeSingle();
  const userId = prof?.id;
  if (!userId) return "skip: no user";

  // Idempotent — already summarized this day?
  const { data: existing } = await admin
    .from("daily_learning")
    .select("id")
    .eq("user_id", userId)
    .eq("learn_date", dayKey)
    .maybeSingle();
  if (existing) return "exists";

  // Yesterday's quiz + result.
  const { data: qc } = await admin
    .from("daily_content")
    .select("payload")
    .eq("content_date", dayKey)
    .eq("type", "eng_q")
    .maybeSingle();
  const questions = ((qc?.payload as any)?.questions || []) as any[];
  if (questions.length === 0) return "skip: no quiz";

  const { data: result } = await admin
    .from("quiz_results")
    .select("score, total, answers")
    .eq("user_id", userId)
    .eq("quiz_date", dayKey)
    .maybeSingle();
  const answers = (result?.answers || []) as { qi: number; isCorrect: boolean }[];
  const correctSet = new Set(answers.filter((a) => a.isCorrect).map((a) => a.qi));

  const qList = questions
    .map((q, i) => {
      const status = result ? (correctSet.has(i) ? "✓ got right" : "✗ missed") : "not answered";
      return `- [${q.concept}] ${q.question} (${status})\n  Key idea: ${q.explanation}`;
    })
    .join("\n");

  const summary = await chat(
    [
      {
        role: "system",
        content:
          "You write a short 'what you learned today' recap for an engineer studying to become an architect. Given the day's quiz questions, their key ideas, and which the learner got right/wrong, produce an encouraging Markdown recap: a one-line intro, 3-6 bullet takeaways (emphasize concepts they MISSED as things to reinforce), and a one-line 'focus tomorrow'. Concise, concrete, no fluff.",
      },
      { role: "user", content: `Date: ${dayKey}\nScore: ${result ? `${result.score}/${result.total}` : "n/a"}\n\nQuestions:\n${qList}` },
    ],
    { temperature: 0.5, maxTokens: 500, timeoutMs: 40000 }
  );

  const concepts = questions.map((q) => q.concept).filter(Boolean).slice(0, 12);
  const { error } = await admin.from("daily_learning").insert({
    user_id: userId,
    learn_date: dayKey,
    summary: summary.trim(),
    concepts,
    score: result?.score ?? null,
    total: result?.total ?? null,
  });
  if (error) return `error: ${error.message}`;
  return "ok";
}

// Roll up the previous day's coach conversation into one long-term memory row,
// so the coach carries continuity across days even after raw messages are pruned.
// Single-user app: operates on the one profile's user id.
async function summarizeYesterday(
  admin: ReturnType<typeof createAdminClient>
): Promise<string> {
  // Yesterday's date range (UTC).
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  const dayKey = start.toISOString().slice(0, 10);

  // Single-user: pick the (one) profile.
  const { data: prof } = await admin.from("profiles").select("id").limit(1).maybeSingle();
  const userId = prof?.id;
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
