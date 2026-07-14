import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatStream, type ChatMessage } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { SKILL_LABEL } from "@/lib/skills";

export const runtime = "nodejs";

// GET -> recent chat history so the coach UI can restore the conversation.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(200);

  return NextResponse.json({ messages: data || [] });
}

// POST { message: string } -> { reply: string }
// The coach sees your prefs, long-term memory, active goals, and recent chat.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { message } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  // Pull personalization context in parallel. Daily summaries get their own
  // dedicated slots (last 7) so a week of continuity is always present,
  // separate from the 25 ad-hoc memories.
  const [profileRes, memoryRes, summaryRes, goalsRes, historyRes, skillRes, learnerRes] = await Promise.all([
    supabase.from("profiles").select("name, prefs").eq("id", user.id).single(),
    supabase.from("memory").select("kind, content").eq("user_id", user.id).neq("kind", "daily_summary").order("created_at", { ascending: false }).limit(25),
    supabase.from("memory").select("content, created_at").eq("user_id", user.id).eq("kind", "daily_summary").order("created_at", { ascending: false }).limit(7),
    supabase.from("goals").select("title, cadence").eq("user_id", user.id).eq("active", true),
    supabase.from("chat_messages").select("role, content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("skill_profile").select("skill, level, proficiency, seen").eq("user_id", user.id),
    supabase.from("learner_profile").select("narrative, strengths, gaps").eq("user_id", user.id).maybeSingle(),
  ]);

  const name = profileRes.data?.name || "there";
  const prefs = profileRes.data?.prefs || {};
  const memories = (memoryRes.data || []).map((m) => `- (${m.kind}) ${m.content}`).join("\n");
  const summaries = (summaryRes.data || [])
    .reverse()
    .map((s) => `- ${(s.created_at || "").slice(0, 10)}: ${s.content}`)
    .join("\n");
  const goals = (goalsRes.data || []).map((g) => `- [${g.cadence}] ${g.title}`).join("\n");
  const history = (historyRes.data || []).reverse();
  const skillProfile = (skillRes.data || [])
    .filter((s) => s.seen > 0)
    .sort((a, b) => a.proficiency - b.proficiency)
    .map((s) => `- ${SKILL_LABEL[s.skill] || s.skill}: ${s.proficiency}/100 (level ${s.level}/5)`)
    .join("\n");
  const learner = learnerRes.data;
  const learnerModel = learner?.narrative
    ? `${learner.narrative}${learner.gaps?.length ? `\nCurrent gaps: ${learner.gaps.join(", ")}` : ""}`
    : "";

  const system = `You are Butler, ${name}'s personal engineering mentor. You help them become a stronger software architect and improve individually.

Be warm, direct, and concise. Ask sharp follow-up questions. When relevant, connect advice back to their goals. Push them to reflect and to act. Avoid generic filler.

What you know about ${name}:
Preferences: ${JSON.stringify(prefs)}

Your model of how they learn and think (from their sessions):
${learnerModel || "(still building — encourage them to do daily sessions)"}

Recent daily recaps (what they've been working on lately):
${summaries || "(none yet)"}

Their architect skill profile (weakest first — proactively coach toward the weak areas):
${skillProfile || "(no assessment yet — encourage them to take the daily quiz)"}

Long-term memory (most recent first):
${memories || "(none yet)"}

Active goals:
${goals || "(none set yet)"}

If the user reveals a durable preference, milestone, or insight worth remembering, end your reply with a line exactly like:
<remember kind="preference|milestone|insight">the thing to remember</remember>
Only include that tag when it's genuinely worth persisting.`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...history.map((h) => ({ role: h.role as ChatMessage["role"], content: h.content })),
    { role: "user", content: message },
  ];

  // Stream the reply to the client as plain text, buffering the full raw output.
  // The <remember> tag (if any) is never streamed to the user, and after the
  // stream completes we extract it, persist the exchange, and prune.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let raw = "";
      let visible = ""; // what we've actually sent to the client
      try {
        for await (const chunk of chatStream(messages, { model: modelFor("coach") })) {
          raw += chunk;
          // Hold back text from a <remember tag onward so it's never shown.
          const cut = raw.search(/<remember/i);
          const showable = cut === -1 ? raw : raw.slice(0, cut);
          if (showable.length > visible.length) {
            const delta = showable.slice(visible.length);
            visible = showable;
            controller.enqueue(encoder.encode(delta));
          }
        }
      } catch (e: any) {
        // If nothing streamed yet, surface a readable message inline.
        if (!visible) {
          controller.enqueue(
            encoder.encode("Sorry — I couldn't reach the model. Please try again.")
          );
        }
      } finally {
        controller.close();
      }

      // ---- After streaming: extract remember tag, persist, prune. ----
      const rememberMatch = raw.match(/<remember kind="([^"]+)">([\s\S]*?)<\/remember>/);
      const reply = raw.replace(/<remember[\s\S]*?<\/remember>/g, "").trim();
      const ALLOWED_KINDS = new Set(["preference", "milestone", "insight", "note"]);
      const rememberKind = rememberMatch ? rememberMatch[1].trim() : null;
      const rememberContent = rememberMatch ? rememberMatch[2].trim().slice(0, 500) : null;
      const validRemember =
        rememberKind && rememberContent && ALLOWED_KINDS.has(rememberKind);

      if (reply) {
        const writes: PromiseLike<unknown>[] = [
          supabase.from("chat_messages").insert([
            { user_id: user.id, role: "user", content: message },
            { user_id: user.id, role: "assistant", content: reply },
          ]),
        ];
        if (validRemember) {
          writes.push(
            supabase.from("memory").insert({
              user_id: user.id,
              kind: rememberKind,
              content: rememberContent,
            })
          );
        }
        await Promise.all(writes).catch(() => {});
        pruneHistory(supabase, user.id).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

// Bound storage growth. For each table, find the Nth-newest row's timestamp and
// delete anything older. Two small indexed queries per prune; best-effort.
type DbClient = Awaited<ReturnType<typeof createClient>>;
async function pruneHistory(supabase: DbClient, userId: string) {
  await Promise.all([
    pruneTable(supabase, "chat_messages", userId, 500),
    // Prune ad-hoc memories only; daily_summary rows are long-term and preserved.
    pruneTable(supabase, "memory", userId, 100, "daily_summary"),
  ]);
}

async function pruneTable(
  supabase: DbClient,
  table: "chat_messages" | "memory",
  userId: string,
  keep: number,
  excludeKind?: string
) {
  // The row at offset `keep` (0-indexed) is the newest row we want to drop.
  let sel = supabase
    .from(table)
    .select("created_at")
    .eq("user_id", userId);
  if (excludeKind) sel = sel.neq("kind", excludeKind);
  const { data } = await sel.order("created_at", { ascending: false }).range(keep, keep);
  const cutoff = data?.[0]?.created_at;
  if (!cutoff) return; // fewer than `keep` rows — nothing to prune

  let del = supabase.from(table).delete().eq("user_id", userId).lt("created_at", cutoff);
  if (excludeKind) del = del.neq("kind", excludeKind);
  await del;
}
