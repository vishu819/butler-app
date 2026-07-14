import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat, type ChatMessage } from "@/lib/openrouter";

export const runtime = "nodejs";

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

  // Pull personalization context in parallel.
  const [profileRes, memoryRes, goalsRes, historyRes] = await Promise.all([
    supabase.from("profiles").select("name, prefs").eq("id", user.id).single(),
    supabase.from("memory").select("kind, content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(25),
    supabase.from("goals").select("title, cadence").eq("user_id", user.id).eq("active", true),
    supabase.from("chat_messages").select("role, content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
  ]);

  const name = profileRes.data?.name || "there";
  const prefs = profileRes.data?.prefs || {};
  const memories = (memoryRes.data || []).map((m) => `- (${m.kind}) ${m.content}`).join("\n");
  const goals = (goalsRes.data || []).map((g) => `- [${g.cadence}] ${g.title}`).join("\n");
  const history = (historyRes.data || []).reverse();

  const system = `You are PI, ${name}'s personal growth coach and mentor. You help them become a stronger software architect and improve individually.

Be warm, direct, and concise. Ask sharp follow-up questions. When relevant, connect advice back to their goals. Push them to reflect and to act. Avoid generic filler.

What you know about ${name}:
Preferences: ${JSON.stringify(prefs)}

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

  let raw: string;
  try {
    raw = await chat(messages);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "LLM error" }, { status: 502 });
  }

  // Extract & strip any <remember> tag, persist it.
  const rememberMatch = raw.match(/<remember kind="([^"]+)">([\s\S]*?)<\/remember>/);
  const reply = raw.replace(/<remember[\s\S]*?<\/remember>/g, "").trim();

  // Persist the exchange (and any remembered fact).
  const writes: PromiseLike<unknown>[] = [
    supabase.from("chat_messages").insert([
      { user_id: user.id, role: "user", content: message },
      { user_id: user.id, role: "assistant", content: reply },
    ]),
  ];
  if (rememberMatch) {
    writes.push(
      supabase.from("memory").insert({
        user_id: user.id,
        kind: rememberMatch[1],
        content: rememberMatch[2].trim(),
      })
    );
  }
  await Promise.all(writes);

  return NextResponse.json({ reply });
}
