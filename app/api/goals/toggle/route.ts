import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST { goal_id, done } -> upsert today's check-off
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { goal_id, done } = await req.json();
  if (!goal_id) return NextResponse.json({ error: "goal_id required" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("goal_logs")
    .upsert(
      { user_id: user.id, goal_id, log_date: today, done: !!done },
      { onConflict: "goal_id,log_date" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
