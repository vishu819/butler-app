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
          content:
            "You produce a compact Mermaid diagram that visually summarizes a software concept for review. Use `flowchart TD` or `mindmap` syntax. Keep it to 5-9 nodes, clear labels, no styling directives. Node text must avoid parentheses, quotes, and special characters (Mermaid breaks on them) — use plain words. Return JSON only.",
        },
        {
          role: "user",
          content: `Concept: "${concept}". Return JSON: {"diagram": "valid mermaid source (flowchart TD ... )", "caption": "one-line what this diagram shows"}. The diagram must be syntactically valid Mermaid with simple alphanumeric node labels.`,
        },
      ],
      { json: true, temperature: 0.4, maxTokens: 700, timeoutMs: 40000 }
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
