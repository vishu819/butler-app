import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";
import { modelFor } from "@/lib/models";
import { BRAIN_CATEGORIES, nextCategory } from "@/lib/brain-gym";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { category? } -> a rapid-fire round of quick MCQs for a speed game.
// If no category, picks the next in rotation. "mixed" spreads across categories.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty ok */
  }
  let category: string = body?.category;
  const mixed = category === "mixed";
  if (!mixed && (!category || !BRAIN_CATEGORIES.some((c) => c.key === category))) {
    const { data: log } = await supabase
      .from("brain_gym_log")
      .select("category")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(BRAIN_CATEGORIES.length);
    category = nextCategory((log || []).map((l) => l.category));
  }

  const focus = mixed
    ? "a mix across memory, logic, spatial reasoning, pattern recognition, mental math, verbal, and attention"
    : `the "${BRAIN_CATEGORIES.find((c) => c.key === category)!.label}" category`;

  try {
    const raw = await chat(
      [
        {
          role: "system",
          content:
            "You generate FAST, punchy brain-teaser multiple-choice questions for a timed speed game. Each must be solvable in ~10-15 seconds, unambiguous, with exactly 4 short options. Vary difficulty. Return JSON only.",
        },
        {
          role: "user",
          content: `Generate 8 quick MCQs testing ${focus}. Return JSON: {"questions":[{"q":"short question","options":["a","b","c","d"],"correct":0}]}. Keep questions and options SHORT (few words). Vary the correct index.`,
        },
      ],
      { model: modelFor("generate"), json: true, temperature: 0.9, maxTokens: 1600, timeoutMs: 40000 }
    );
    const parsed = JSON.parse(raw);
    const questions = (parsed.questions || []).filter(
      (q: any) =>
        q && typeof q.q === "string" && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correct)
    );
    if (questions.length === 0) throw new Error("no questions");
    return NextResponse.json({ category: mixed ? "mixed" : category, questions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "generation failed" }, { status: 502 });
  }
}
