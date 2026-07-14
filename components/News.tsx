"use client";

import { useEffect, useState } from "react";
import { Newspaper, ChevronRight } from "lucide-react";
import { cachedGet } from "@/lib/fetch-cache";

type News = { items: { title: string; url: string }[]; digest: string };

export default function News() {
  const [news, setNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cachedGet("/api/today")
      .then((j) => setNews((j.content?.news as News) || null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="icon-tile h-9 w-9">
          <Newspaper size={18} />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">AI News</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Today&apos;s digest for engineers
          </p>
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-24 rounded-2xl" />
      ) : !news || (!news.digest && !news.items?.length) ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No AI headlines yet today. The daily job refreshes this each morning.
        </p>
      ) : (
        <>
          {news.digest && (
            <ul className="mb-3 space-y-1.5">
              {digestBullets(news.digest).map((b, i) => (
                <li key={i} className="flex gap-2 text-sm leading-snug">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                  <span style={{ color: "var(--ink)" }}>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {news.items?.length > 0 && (
            <div className="space-y-1.5">
              <p className="section-label">Sources</p>
              {news.items.map((it, i) => (
                <a
                  key={i}
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  className="card-tap flex items-center gap-2 rounded-xl border px-3 py-2"
                  style={{ borderColor: "rgba(0,0,0,0.07)" }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" style={{ color: "var(--ink)" }}>
                      {it.title}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {hostname(it.url)}
                    </span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-gray-300" />
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </section>
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
