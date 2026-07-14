import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BRAIN_CATEGORIES } from "@/lib/brain-gym";

export const runtime = "nodejs";

// POST { category, duration_sec, completed, correct? } -> record a brain-gym attempt.
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
  const { category, duration_sec, completed, correct } = body;
  if (!BRAIN_CATEGORIES.some((c) => c.key === category)) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("brain_gym_log").insert({
    user_id: user.id,
    category,
    log_date: today,
    duration_sec: typeof duration_sec === "number" ? duration_sec : null,
    completed: !!completed,
    correct: typeof correct === "boolean" ? correct : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// GET -> per-category training counts (for the "trained every aspect" view).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("brain_gym_log")
    .select("category")
    .eq("user_id", user.id);
  const counts: Record<string, number> = {};
  for (const c of BRAIN_CATEGORIES) counts[c.key] = 0;
  for (const row of data || []) counts[row.category] = (counts[row.category] || 0) + 1;
  return NextResponse.json({ counts });
}
