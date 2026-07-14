import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET -> the user's saved bookmarks (Library).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("bookmarks")
    .select("id, title, url, source, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({ bookmarks: data || [] });
}

// POST { title, url } -> save a link. Idempotent per (user, url).
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
  const { title, url } = body || {};
  if (!title || !url) return NextResponse.json({ error: "title and url required" }, { status: 400 });

  let source: string | null = null;
  try {
    source = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* leave null */
  }

  const { data, error } = await supabase
    .from("bookmarks")
    .upsert({ user_id: user.id, title, url, source }, { onConflict: "user_id,url" })
    .select("id, title, url, source, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookmark: data });
}

// DELETE { id } -> remove a bookmark.
export async function DELETE(req: Request) {
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
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("id", body.id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
