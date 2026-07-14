import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAINews, digestNews, type NewsPayload } from "@/lib/news";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET ?refresh=1 -> today's AI news. Serves today's cached payload if present,
// otherwise fetches LIVE (so the feed is never stale/empty even if the cron
// hasn't run). refresh=1 forces a live re-fetch.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const force = new URL(req.url).searchParams.get("refresh") === "1";
  const today = new Date().toISOString().slice(0, 10);

  if (!force) {
    const { data } = await supabase
      .from("daily_content")
      .select("payload")
      .eq("content_date", today)
      .eq("type", "news")
      .maybeSingle();
    const cached = data?.payload as NewsPayload | undefined;
    if (cached?.items?.length) {
      return NextResponse.json({ date: today, news: cached, fresh: false });
    }
  }

  // Live fetch + digest, then cache for the rest of the day.
  const items = await fetchAINews();
  const digest = await digestNews(items);
  const news: NewsPayload = { items, digest };

  // daily_content is global + RLS-locked to SELECT for users; cache via admin.
  try {
    const admin = createAdminClient();
    await admin
      .from("daily_content")
      .upsert(
        { content_date: today, type: "news", payload: news },
        { onConflict: "content_date,type" }
      );
  } catch {
    // best-effort cache; the client already has the fresh data
  }

  return NextResponse.json({ date: today, news, fresh: true });
}
