"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Bookmark, Check } from "lucide-react";
import { cachedGet, invalidate } from "@/lib/fetch-cache";
import { toast } from "./ui/Toast";

type Item = { title: string; url: string };
type News = { items: Item[]; digest: string };

export default function News() {
  const [news, setNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  function load() {
    setLoading(true);
    cachedGet("/api/news")
      .then((j) => setNews((j.news as News) || null))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    cachedGet("/api/bookmarks")
      .then((j) => setSaved(new Set((j.bookmarks || []).map((b: any) => b.url))))
      .catch(() => {});
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      invalidate("/api/news");
      const r = await fetch("/api/news?refresh=1");
      const j = await r.json();
      setNews((j.news as News) || null);
      toast("Latest headlines loaded", "good");
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
          Fresh AI headlines for engineers
        </p>
        <button
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh news"
          className="flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-50"
          style={{ background: "rgba(0,0,0,0.05)", color: "var(--muted)" }}
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Digest sits in one card at the top */}
      {loading ? (
        <>
          <div className="skeleton h-24 rounded-3xl" />
          <div className="skeleton h-20 rounded-3xl" />
        </>
      ) : !news || !news.items?.length ? (
        <div className="card text-center text-sm" style={{ color: "var(--muted)" }}>
          No AI headlines right now. Tap refresh to fetch the latest.
        </div>
      ) : (
        <>
          {news.digest && (
            <section className="card">
              <p className="section-label mb-2">Today&apos;s digest</p>
              <ul className="space-y-1.5">
                {digestBullets(news.digest).map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-snug">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                    <span style={{ color: "var(--ink)" }}>{b}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Each headline is its own card, source at the bottom */}
          {news.items.map((it, i) => {
            const isSaved = saved.has(it.url);
            return (
              <section key={i} className="card">
                <a href={it.url} target="_blank" rel="noreferrer" className="block">
                  <h3 className="text-[15px] font-medium leading-snug" style={{ color: "var(--ink)" }}>
                    {it.title}
                  </h3>
                </a>
                <div className="mt-3 flex items-center justify-between border-t pt-2" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                  <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
                    <ExternalLink size={11} /> {hostname(it.url)}
                  </span>
                  <button
                    onClick={() => bookmark(it)}
                    aria-label={isSaved ? "Saved" : "Save to Library"}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                    style={isSaved ? { color: "var(--accent-soft-ink)", background: "var(--accent-soft)" } : { color: "var(--muted)" }}
                  >
                    {isSaved ? <Check size={15} /> : <Bookmark size={15} />}
                  </button>
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function digestBullets(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[\s\-•*\d.]+/, "").trim())
    .filter((l) => l.length > 3);
}
function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}
