// Deep daily study article generation, shared by the daily cron (dispatcher)
// and the per-user article endpoint (worker). Kept out of the route files so a
// single user's heavy generation can run in its OWN function invocation with a
// fresh 60s budget — the free-tier-safe way to scale past one active user.
import { createAdminClient } from "@/lib/supabase/admin";
import { chat, chatWithMeta } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";

type Admin = ReturnType<typeof createAdminClient>;

// Strip anything script-like from LLM-produced HTML before we store/render it.
// Rendered with dangerouslySetInnerHTML, so remove <script>, <style>, event
// handlers, and javascript: URLs defensively.
export function sanitizeHtml(html: string): string {
  return (html || "")
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

// Yesterday's date key (UTC), shared by dispatcher (to find who needs one) and
// worker (to generate it).
export function yesterdayKey(): string {
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  return y.toISOString().slice(0, 10);
}

// Build the deep article by planning sections, generating them in parallel, and
// clubbing the results. Each section is an independent bounded call — faster
// (parallel) and more reliable (no single call can end the whole article early).
// Falls back to a single monolithic call if planning fails.
async function buildArticle(
  targetRole: string,
  activityBrief: string,
  missed: string[],
  skipped: string[]
): Promise<string> {
  const END = "<!--END-->";

  async function fragment(
    system: string,
    user: string,
    { maxTokens = 2200, online = false }: { maxTokens?: number; online?: boolean } = {}
  ): Promise<string> {
    const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    let out = "";
    for (let round = 0; round < 3; round++) {
      const { content, finishReason } = await chatWithMeta(msgs, {
        model: modelFor(online ? "web" : "generate"),
        temperature: 0.6,
        maxTokens,
        timeoutMs: 45000,
        online,
      });
      out += content;
      if (out.includes(END) || finishReason !== "length") break;
      msgs.push({ role: "assistant", content });
      msgs.push({
        role: "user",
        content: `Continue from exactly where you stopped — no repetition, no preamble. End with ${END} when done.`,
      });
    }
    return out.split(END)[0].trim();
  }

  // 1) PLAN — the 3-5 concept sections to write.
  let sections: { title: string; focus: string }[] = [];
  try {
    const raw = await chat(
      [
        {
          role: "system",
          content: `You plan a deep study article for a learner training toward "${targetRole}". Pick the 3-5 highest-leverage concepts from their activity — PRIORITISE what they missed or skipped. Return JSON only.`,
        },
        {
          role: "user",
          content: `${activityBrief}\n\nReturn JSON: {"sections":[{"title":"concept name","focus":"what to teach & which gap it closes"}]} — 3 to 5 sections, most important first.`,
        },
      ],
      { model: modelFor("generate"), json: true, temperature: 0.4, maxTokens: 700, timeoutMs: 25000 }
    );
    const parsed = JSON.parse(raw);
    sections = (parsed.sections || [])
      .filter((s: any) => s?.title)
      .slice(0, 5)
      .map((s: any) => ({ title: String(s.title), focus: String(s.focus || "") }));
  } catch {
    sections = [];
  }

  // Fallback: no plan → one monolithic call (still continuation-guarded).
  if (sections.length === 0) {
    return fragment(
      `You are Butler, an elite mentor writing a learner's DAILY DEEP-DIVE. Training toward "${targetRole}". Teach the concepts they engaged with from foundations to ${targetRole}-level depth, focusing on what they got wrong/skipped. Output semantic HTML only (<h2>/<h3>/<p>/<ul>/<li>/<strong>/<code>/<pre>). Start with <h2>What you touched yesterday</h2>, a MISSED/SKIPPED callout <div>, one <h2> per concept, then <h2>Don't miss this</h2>. End with ${END}.`,
      activityBrief,
      { maxTokens: 4000, online: true }
    );
  }

  const gaps = [...missed, ...skipped];
  const secSystem = `You are Butler, an elite mentor. Write ONE section of a larger study article for a learner training toward "${targetRole}". Teach this ONE concept rigorously: foundations → tradeoffs → ${targetRole}-level decisions → common mistakes/failure modes. Concrete numbers, worked examples, short code where it clarifies. Output semantic HTML only — a single <h2> heading for the concept then <p>/<ul>/<li>/<strong>/<em>/<code>/<pre><code>. No preamble, no <html> wrapper. You MAY use web search for authoritative references, cited as <a href>. End with ${END}.`;

  // 2) SECTIONS — generate all in parallel.
  const bodies = await Promise.all(
    sections.map((s) =>
      fragment(
        secSystem,
        `Concept: "${s.title}"\nWhat to cover: ${s.focus}\n${
          gaps.includes(s.title)
            ? "NOTE: the learner got this WRONG or SKIPPED it — be especially thorough on where the misunderstanding lies.\n"
            : ""
        }\nContext (their activity):\n${activityBrief.slice(0, 2500)}`,
        { maxTokens: 2200, online: true }
      ).catch(() => `<h2>${s.title}</h2><p>(Could not generate this section.)</p>`)
    )
  );

  // 3) CLUB — intro + missed/skipped callout + sections + takeaways.
  const [intro, takeaways] = await Promise.all([
    fragment(
      `Write the opening of a study article as semantic HTML: an <h2>What you touched yesterday</h2> heading + one orienting <p>, then a <div> callout naming what they MISSED or SKIPPED and why it matters most. HTML only. End with ${END}.`,
      activityBrief,
      { maxTokens: 500 }
    ).catch(() => ""),
    fragment(
      `Write a closing <h2>Don't miss this</h2> section as semantic HTML: a <ul> of the 5-8 highest-leverage takeaways across these concepts: ${sections
        .map((s) => s.title)
        .join(", ")}. HTML only. End with ${END}.`,
      activityBrief,
      { maxTokens: 700 }
    ).catch(() => ""),
  ]);

  return [intro, ...bodies, takeaways].filter(Boolean).join("\n\n").trim();
}

// Generate + store ONE user's deep article for yesterday. Idempotent (skips if a
// row already exists). Returns a short status string for logging.
export async function generateDailyArticle(admin: Admin, userId: string): Promise<string> {
  const dayKey = yesterdayKey();
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

  // ---- Gather yesterday's activity ----
  const { data: session } = await admin
    .from("sessions")
    .select("questions, responses")
    .eq("user_id", userId)
    .eq("session_date", dayKey)
    .maybeSingle();
  const questions = ((session?.questions || []) as any[]) || [];
  const responses = ((session?.responses || []) as any[]) || [];

  const { data: learnRows } = await admin
    .from("learn_articles")
    .select("concept, question, article")
    .eq("user_id", userId)
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd)
    .order("created_at", { ascending: true });
  const learnArticles = (learnRows || []) as { concept: string; question: string | null; article: string }[];

  // No activity yesterday → skip silently.
  if (questions.length === 0 && learnArticles.length === 0) return "skip: no activity";

  const { data: profileRow } = await admin
    .from("profiles")
    .select("target_role")
    .eq("id", userId)
    .maybeSingle();
  const targetRole = profileRow?.target_role || "architect";

  // ---- Build the activity brief ----
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

  const activityBrief = `Date: ${dayKey}
Session score: ${questions.length ? `${score}/${questions.length}` : "no session"}
Concepts MISSED (wrong): ${missed.join(", ") || "none"}
Concepts SKIPPED (not answered): ${skipped.join(", ") || "none"}
Concepts got right: ${gotRight.join(", ") || "none"}

=== Session questions (with the correct idea and their result) ===
${qList || "(no session)"}

=== "Learn this topic" articles they opened yesterday ===
${learnBrief}`;

  const article = await buildArticle(targetRole, activityBrief, missed, skipped);

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
        content: `Missed: ${missed.join(", ") || "none"}. Skipped: ${skipped.join(", ") || "none"}. Also opened deep reads on: ${
          learnArticles.map((a) => a.concept).join(", ") || "none"
        }.`,
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
