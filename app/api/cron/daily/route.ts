import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chat } from "@/lib/openrouter";

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

  // ---- Daily quiz: 10 adaptive MCQs on architect fundamentals ----
  if (!have.has("eng_q")) {
    try {
      // Last ~10 days of quizzes -> avoid repeating the concepts we've asked.
      const { data: recentQuizzes } = await admin
        .from("daily_content")
        .select("payload")
        .eq("type", "eng_q")
        .order("content_date", { ascending: false })
        .limit(10);
      const askedConcepts = (recentQuizzes || [])
        .flatMap((r) => (r.payload as any)?.questions || [])
        .map((q: any) => q?.concept)
        .filter(Boolean);

      // Recent quiz performance -> target weak areas.
      const { data: recentResults } = await admin
        .from("quiz_results")
        .select("score, total, weak_concepts")
        .order("quiz_date", { ascending: false })
        .limit(10);
      const weakConcepts = Array.from(
        new Set((recentResults || []).flatMap((r) => r.weak_concepts || []))
      ).slice(0, 15);
      const avgPct =
        recentResults && recentResults.length
          ? Math.round(
              (recentResults.reduce(
                (s, r) => s + (r.total ? (r.score ?? 0) / r.total : 0),
                0
              ) /
                recentResults.length) *
                100
            )
          : null;

      const adaptContext = `Concepts already tested recently (avoid repeating these exact concepts): ${
        askedConcepts.join(", ") || "(none yet)"
      }

Learner's weak areas from past quizzes (INCLUDE at least 3 questions targeting these): ${
        weakConcepts.join(", ") || "(none identified yet)"
      }
Recent average: ${avgPct ?? "n/a"}%. ${
        avgPct == null
          ? "No history — cover solid fundamentals broadly."
          : avgPct >= 80
          ? "Doing well — raise difficulty, include a few deeper/edge-case questions."
          : avgPct < 60
          ? "Struggling — reinforce weak areas at a clear, foundational depth."
          : "Steady, challenging level."
      }`;

      const sys =
        "You are a software-architecture tutor creating multiple-choice quiz questions for a senior engineer becoming a great software architect. Cover broad architect fundamentals: distributed systems, databases & data modeling, API design, caching, concurrency & consistency, networking, security, messaging/queues, observability, scalability tradeoffs. Questions must be SPECIFIC and concrete (not open-ended 'design X' prompts) — answerable by tapping one option. Each explanation must teach the underlying KEY CONCEPT in depth (why the right answer is right, why the tempting wrong ones are wrong, and the principle to remember). Return JSON only.";

      // Generate in two parallel batches of 5 — faster and more reliable than one big call.
      const batchPrompt = (n: number, focus: string) => `${adaptContext}

Produce ${n} quiz questions (${focus}) as JSON:
{"questions":[{"concept":"short tag e.g. 'CAP theorem'","question":"specific question","options":["A","B","C","D"],"correct":0,"explanation":"3-5 sentences teaching the key concept in depth: why the correct option is right, why tempting wrong picks are wrong, and the principle to remember."}]}
Exactly ${n} questions, exactly 4 options each, vary the correct index, keep them independent and unambiguous.`;

      const [b1, b2] = await Promise.all([
        chat(
          [
            { role: "system", content: sys },
            { role: "user", content: batchPrompt(5, "covering distributed systems, databases, API design, caching, concurrency") },
          ],
          { json: true, temperature: 0.8, maxTokens: 2200, timeoutMs: 55000 }
        ),
        chat(
          [
            { role: "system", content: sys },
            { role: "user", content: batchPrompt(5, "covering networking, security, messaging/queues, observability, scalability tradeoffs") },
          ],
          { json: true, temperature: 0.85, maxTokens: 2200, timeoutMs: 55000 }
        ),
      ]);

      const q1 = (JSON.parse(b1).questions || []) as unknown[];
      const q2 = (JSON.parse(b2).questions || []) as unknown[];
      const questions = [...q1, ...q2];
      rows.push({
        content_date: today,
        type: "eng_q",
        payload: { title: "Architecture Fundamentals — Daily Quiz", questions },
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

  return NextResponse.json({ date: today, results });
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
