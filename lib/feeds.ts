import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";

export type FeedItem = { title: string; url: string; source?: string; note?: string };

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseItems(raw: string): FeedItem[] {
  let txt = raw.trim();
  // Strip code fences if the model wrapped JSON.
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) txt = fence[1].trim();
  let arr: any;
  try {
    const parsed = JSON.parse(txt);
    arr = Array.isArray(parsed) ? parsed : parsed.items;
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x.title === "string" && typeof x.url === "string" && /^https?:\/\//.test(x.url))
    .slice(0, 8)
    .map((x) => ({
      title: String(x.title).slice(0, 200),
      url: x.url,
      source: hostname(x.url),
      note: typeof x.note === "string" ? x.note.slice(0, 160) : undefined,
    }));
}

// Canonical must-read papers/writings for a software architect.
export async function fetchPapers(): Promise<FeedItem[]> {
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You curate must-read papers and canonical writings for someone becoming a senior software architect (distributed systems, databases, scalability, consistency, reliability). Return ONLY JSON: a list of 6-8 items, each {\"title\", \"url\" (a real, working link to the paper/PDF or its canonical page), \"note\" (one line: why an architect must read it)}. Prefer timeless classics (Dynamo, MapReduce, Raft, Bigtable, CAP, Spanner, Kafka, etc.) plus 1-2 widely-cited recent ones. Only real URLs.",
      },
      { role: "user", content: "List the must-read papers for a software architect as JSON." },
    ],
    { model: modelFor("web"), online: true, maxTokens: 1200, timeoutMs: 45000 }
  );
  return parseItems(raw);
}

// Recent, notable engineering-blog posts from top companies.
export async function fetchCompanyArticles(): Promise<FeedItem[]> {
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You curate recent, notable engineering-blog articles from top tech companies (Netflix, Uber, Stripe, Cloudflare, Discord, Meta, Google, AWS, Figma, etc.) that teach real software-architecture lessons. Return ONLY JSON: a list of 6-8 items, each {\"title\", \"url\" (real link to the post), \"note\" (one line: the architecture lesson)}. Favor posts from the last ~12 months. Only real URLs.",
      },
      { role: "user", content: "List recent must-read company engineering articles as JSON." },
    ],
    { model: modelFor("web"), online: true, maxTokens: 1200, timeoutMs: 45000 }
  );
  return parseItems(raw);
}
