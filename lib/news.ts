import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";

export type NewsItem = { title: string; url: string };
export type NewsPayload = { items: NewsItem[]; digest: string };

const AI_KW =
  /\b(ai|a\.i\.|llm|gpt|chatgpt|claude|gemini|llama|mistral|openai|anthropic|deepmind|model|models|neural|machine learning|\bml\b|agent|agents|diffusion|transformer|inference|fine-tun|rag|embedding)\b/i;

// Pull Hacker News top + new stories, keep only AI-relevant and RECENT ones.
// Free, no API key. Freshness: HN "topstories" is live; we also sort by time
// and drop anything older than ~48h so the feed never shows stale links.
export async function fetchAINews(limit = 8): Promise<NewsItem[]> {
  const [topRes, newRes] = await Promise.all([
    fetch("https://hacker-news.firebaseio.com/v0/topstories.json", { cache: "no-store" }),
    fetch("https://hacker-news.firebaseio.com/v0/newstories.json", { cache: "no-store" }),
  ]);
  const topIds: number[] = await topRes.json();
  const newIds: number[] = await newRes.json();
  // Blend top (relevance) with new (freshness); dedupe.
  const ids = Array.from(new Set([...topIds.slice(0, 60), ...newIds.slice(0, 40)]));

  const stories = await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          cache: "no-store",
        });
        return (await r.json()) as { id?: number; title?: string; url?: string; time?: number };
      } catch {
        return null;
      }
    })
  );

  const cutoff = Date.now() / 1000 - 48 * 3600; // last 48h only
  return stories
    .filter((s): s is NonNullable<typeof s> => !!s?.title && AI_KW.test(s.title))
    .filter((s) => (s.time ? s.time >= cutoff : true))
    .sort((a, b) => (b.time || 0) - (a.time || 0)) // newest first
    .slice(0, limit)
    .map((s) => ({
      title: s.title!,
      url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
    }));
}

// Turn headlines into a crisp engineer-facing digest.
export async function digestNews(items: NewsItem[]): Promise<string> {
  if (items.length === 0) return "";
  try {
    return await chat(
      [
        {
          role: "system",
          content:
            "You are an AI-news curator. Given today's top AI-related headlines, write a crisp 4-6 bullet digest for a busy engineer. Each bullet: one line, why it matters. No preamble.",
        },
        { role: "user", content: items.map((i) => `- ${i.title}`).join("\n") },
      ],
      { model: modelFor("web"), maxTokens: 500, timeoutMs: 30000 }
    );
  } catch {
    return "";
  }
}
