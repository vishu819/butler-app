import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPapers, type FeedItem } from "@/lib/feeds";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET ?refresh=1 -> must-read papers for a software architect.
// Cached daily in daily_content (type 'papers'); refresh forces a live re-curate.
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
      .eq("type", "papers")
      .maybeSingle();
    const cached = (data?.payload as { items: FeedItem[] } | undefined)?.items;
    if (cached?.length) return NextResponse.json({ items: cached, fresh: false });
  }

  let items: FeedItem[] = [];
  try {
    items = await fetchPapers();
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "curation failed", items: [] }, { status: 502 });
  }

  if (items.length) {
    try {
      createAdminClient()
        .from("daily_content")
        .upsert({ content_date: today, type: "papers", payload: { items } }, { onConflict: "content_date,type" })
        .then(() => {});
    } catch {
      /* best-effort cache */
    }
  }
  return NextResponse.json({ items, fresh: true });
}
