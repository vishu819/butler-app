import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { concept, skill? } -> generates a Mermaid recap diagram for a concept, saves it.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { concept, skill } = body;
  if (!concept) return NextResponse.json({ error: "concept required" }, { status: 400 });

  let out: { diagram: string; caption: string };
  try {
    const raw = await chat(
      [
        {
          role: "system",
          content: `You produce a clear, insightful Mermaid diagram that helps someone REVISE a software concept — showing the key relationships, tradeoffs, or decision flow, not just a list.

Rules for valid Mermaid (critical — invalid syntax fails to render):
- Use "flowchart TD" (top-down) or "flowchart LR" (left-right for comparisons).
- 6-10 nodes. Node IDs are short alphanumeric (A, B, C1...).
- Node LABELS go in square brackets: A[Label text here]. For decisions use braces: D{Question?}.
- Label text: plain words only. NO parentheses, quotes, colons, semicolons, slashes, or special chars inside labels — they break the parser. Use "and" not "&". Keep labels under ~6 words.
- Edges: A --> B, or labelled A -->|yes| B (edge labels also plain, no special chars).
- Prefer showing a TRADEOFF or DECISION (e.g. branches for "strong vs eventual consistency" and their consequences) — that teaches more than a flat hierarchy.
- No styling/classDef/click directives.
Return JSON only.`,
        },
        {
          role: "user",
          content: `Concept: "${concept}". Make a diagram that captures the essential idea a software architect must remember — ideally the key tradeoff or decision path.
Return JSON: {"diagram": "flowchart TD\\n    A[...] --> B[...]", "caption": "one sentence: what this diagram shows"}.`,
        },
      ],
      { json: true, temperature: 0.4, maxTokens: 800, timeoutMs: 40000 }
    );
    out = JSON.parse(raw);
    if (!out?.diagram) throw new Error("no diagram");
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "diagram generation failed" }, { status: 502 });
  }

  const { data, error } = await supabase
    .from("concept_diagrams")
    .insert({
      user_id: user.id,
      concept,
      skill: skill || null,
      diagram: out.diagram,
      caption: out.caption || null,
    })
    .select("id, concept, diagram, caption, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ diagram: data });
}

// GET -> saved recap diagrams (the "remind me what we learned" review).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("concept_diagrams")
    .select("id, concept, diagram, caption, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ diagrams: data || [] });
}
