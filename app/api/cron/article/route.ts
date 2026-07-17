import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDailyArticle } from "@/lib/daily-article";

export const runtime = "nodejs";
// One user's heavy article generation in its OWN invocation → its own fresh 60s.
export const maxDuration = 60;

// POST { userId } -> generate + store yesterday's deep article for ONE user.
// Protected by CRON_SECRET. The daily cron fans out one call per user to this
// endpoint (fire-and-forget), so each article gets a clean 60s budget rather
// than sharing one function's time across all users.
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const userId = body?.userId;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const admin = createAdminClient();
  try {
    const result = await generateDailyArticle(admin, userId);
    return NextResponse.json({ userId, result });
  } catch (e: any) {
    return NextResponse.json({ userId, result: `error: ${e?.message || e}` }, { status: 500 });
  }
}
