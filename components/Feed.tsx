"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Bookmark, Check, ChevronDown, Sparkles } from "lucide-react";
import { cachedGet, invalidate } from "@/lib/fetch-cache";
import { toast } from "./ui/Toast";
import { Markdown } from "./ui/Markdown";

type Item = { title: string; url: string; source?: string; note?: string };
type Kind = "paper" | "article";

// Reusable card feed for papers / company articles. Each item is its own card
// with the source at the bottom, a bookmark toggle, and summarize-on-open.
export default function Feed({
  endpoint,
  kind,
  emptyText,
}: {
  endpoint: string; // "/api/papers" | "/api/articles"
  kind: Kind;
  emptyText: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  function load() {
    setLoading(true);
    cachedGet(endpoint)
      .then((j) => setItems(j.items || []))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    cachedGet("/api/bookmarks")
      .then((j) => setSaved(new Set((j.bookmarks || []).map((b: any) => b.url))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  async function refresh() {
    setRefreshing(true);
    try {
      invalidate(endpoint);
      const r = await fetch(`${endpoint}?refresh=1`);
      const j = await r.json();
      setItems(j.items || []);
      toast("Refreshed", "good");
    } catch {
      toast("Couldn't refresh", "bad");
    } finally {
      setRefreshing(false);
    }
  }

  async function bookmark(it: Item) {
    if (saved.has(it.url)) return;
    setSaved((s) => new Set(s).add(it.url));
    invalidate("/api/bookmarks");
    toast("Saved to Library", "good");
    await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: it.title, url: it.url }),
    }).catch(() => {});
  }

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {kind === "paper" ? "Canonical reads for architects" : "Lessons from top eng teams"}
        </p>
        <button
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh"
          className="flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-50"
          style={{ background: "rgba(0,0,0,0.05)", color: "var(--muted)" }}
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-28 rounded-3xl" />
          <div className="skeleton h-28 rounded-3xl" />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center text-sm" style={{ color: "var(--muted)" }}>
          {emptyText}
        </div>
      ) : (
        items.map((it, i) => (
          <FeedCard
            key={i}
            item={it}
            kind={kind}
            saved={saved.has(it.url)}
            onBookmark={() => bookmark(it)}
          />
        ))
      )}
    </div>
  );
}

function FeedCard({
  item,
  kind,
  saved,
  onBookmark,
}: {
  item: Item;
  kind: Kind;
  saved: boolean;
  onBookmark: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggleSummary() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (summary || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url, title: item.title, kind }),
      });
      const j = await r.json();
      setSummary(j.summary || "Couldn't summarize this one.");
    } catch {
      setSummary("Couldn't reach the summarizer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <a href={item.url} target="_blank" rel="noreferrer" className="block">
        <h3 className="text-[15px] font-medium leading-snug" style={{ color: "var(--ink)" }}>
          {item.title}
        </h3>
      </a>
      {item.note && (
        <p className="mt-1 text-xs leading-snug" style={{ color: "var(--muted)" }}>
          {item.note}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={toggleSummary}
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
          style={{ background: "var(--accent-soft)", color: "var(--accent-soft-ink)" }}
        >
          <Sparkles size={13} /> {open ? "Hide summary" : "Summarize"}
          <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
        <button
          onClick={onBookmark}
          aria-label={saved ? "Saved" : "Save to Library"}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={saved ? { color: "var(--accent-soft-ink)", background: "var(--accent-soft)" } : { color: "var(--muted)", background: "rgba(0,0,0,0.05)" }}
        >
          {saved ? <Check size={15} /> : <Bookmark size={15} />}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
          {busy && !summary ? (
            <p className="flex items-center gap-2 text-sm" style={{ color: "var(--accent-soft-ink)" }}>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-soft)", borderTopColor: "var(--accent)" }} />
              Reading and summarizing…
            </p>
          ) : (
            summary && <Markdown text={summary} />
          )}
        </div>
      )}

      {/* source at the bottom */}
      <div className="mt-3 flex items-center gap-1 border-t pt-2 text-[11px]" style={{ borderColor: "rgba(0,0,0,0.06)", color: "var(--muted)" }}>
        <ExternalLink size={11} />
        <span>{item.source || hostname(item.url)}</span>
      </div>
    </section>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}
