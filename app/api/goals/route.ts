import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET -> active goals + today's check-off state
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const [goalsRes, logsRes] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).eq("active", true).order("created_at"),
    supabase.from("goal_logs").select("goal_id, done").eq("user_id", user.id).eq("log_date", today),
  ]);

  const doneToday = new Set((logsRes.data || []).filter((l) => l.done).map((l) => l.goal_id));
  const goals = (goalsRes.data || []).map((g) => ({ ...g, done_today: doneToday.has(g.id) }));
  return NextResponse.json({ goals });
}

// POST { title, cadence } -> create goal
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, cadence } = await req.json();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data, error } = await supabase
    .from("goals")
    .insert({ user_id: user.id, title, cadence: cadence || "daily" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goal: data });
}
