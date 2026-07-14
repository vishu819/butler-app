import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET -> the day-by-day learning feed for the Library.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("daily_learning")
    .select("id, learn_date, summary, concepts, score, total")
    .eq("user_id", user.id)
    .order("learn_date", { ascending: false })
    .limit(60);

  return NextResponse.json({ days: data || [] });
}
