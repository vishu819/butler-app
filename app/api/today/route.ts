import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET -> today's cached daily content { eng_q, brain_gym, news }
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("daily_content")
    .select("type, payload")
    .eq("content_date", today);

  const byType: Record<string, unknown> = {};
  for (const row of data || []) byType[row.type] = row.payload;
  return NextResponse.json({ date: today, content: byType });
}
