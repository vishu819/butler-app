import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chat } from "@/lib/openrouter";
import { buildSkillState, generateQuiz, QUIZ_TITLE } from "@/lib/quiz-gen";

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

  // ---- Daily quiz: 10 adaptive, skill-targeted MCQs (same engine as on-demand) ----
  if (!have.has("eng_q")) {
    try {
      // Single-user app: load the (one) user's skill profile to target weaknesses.
      const { data: prof } = await admin.from("profiles").select("id").limit(1).maybeSingle();
      const { data: profileRows } = prof
        ? await admin
            .from("skill_profile")
            .select("skill, level, proficiency, seen")
            .eq("user_id", prof.id)
        : { data: [] as any[] };
      const skillState = buildSkillState(profileRows || []);

      // Avoid repeating recent questions.
      const { data: recentQuizzes } = await admin
        .from("daily_content")
        .select("payload")
        .eq("type", "eng_q")
        .order("content_date", { ascending: false })
        .limit(7);
      const askedQuestions = (recentQuizzes || [])
        .flatMap((r) => (r.payload as any)?.questions || [])
        .map((q: any) => q?.question)
        .filter(Boolean)
        .slice(0, 40);

      const questions = await generateQuiz(skillState, askedQuestions);
      if (questions.length === 0) throw new Error("no valid questions returned");
      rows.push({
        content_date: today,
        type: "eng_q",
        payload: { title: QUIZ_TITLE, questions },
      });
      results.eng_q = `ok (${questions.length} questions)`;
    } catch (e: any) {
      results.eng_q = `error: ${e.message}`;
    }
  }

  // ---- Brain gym ----
  if (!have.has("brain_gym")) {
    try {
      const raw = await chat(
        [
          {
            role: "system",
            content:
              "You create one short daily brain-gym exercise (logic, lateral thinking, pattern, mental math, or memory). It should take 2-5 minutes. Return JSON only.",
          },
          {
            role: "user",
            content:
              'Return JSON: {"kind": string, "prompt": string, "answer": string, "why": string}. Make it fun and genuinely stretching.',
          },
        ],
        { json: true, temperature: 1.0, maxTokens: 700, timeoutMs: 30000 }
      );
      rows.push({ content_date: today, type: "brain_gym", payload: JSON.parse(raw) });
      results.brain_gym = "ok";
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

  return NextResponse.json({ date: today, results });
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
