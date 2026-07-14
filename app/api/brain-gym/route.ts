import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/openrouter";
import { BRAIN_CATEGORIES, nextCategory } from "@/lib/brain-gym";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { category? } -> generates a brain-gym exercise. If no category given,
// picks the next in rotation (least-recently trained) for this user.
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
    /* empty body ok */
  }

  let category: string = body?.category;
  if (!category || !BRAIN_CATEGORIES.some((c) => c.key === category)) {
    const { data: log } = await supabase
      .from("brain_gym_log")
      .select("category")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(BRAIN_CATEGORIES.length);
    category = nextCategory((log || []).map((l) => l.category));
  }
  const cat = BRAIN_CATEGORIES.find((c) => c.key === category)!;

  try {
    const raw = await chat(
      [
        {
          role: "system",
          content: `You create one short brain-gym exercise in the "${cat.label}" category (${cat.desc}). Solvable in about ${Math.round(cat.seconds / 60)} minutes. Return JSON only.`,
        },
        {
          role: "user",
          content:
            'Return JSON: {"kind": string, "prompt": string, "answer": string, "why": string}. Make it fun and genuinely stretching, clearly in the stated category.',
        },
      ],
      { json: true, temperature: 1.0, maxTokens: 700, timeoutMs: 30000 }
    );
    const parsed = JSON.parse(raw);
    return NextResponse.json({
      exercise: { ...parsed, category, seconds: cat.seconds },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "generation failed" }, { status: 502 });
  }
}
