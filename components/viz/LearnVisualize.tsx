"use client";

import { useState } from "react";
import Mermaid from "../Mermaid";
import { Markdown } from "../ui/Markdown";

function MiniSpinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-brand-300 border-t-brand-600" />
  );
}

// "Learn this topic" — streams a study article and shows it inline.
export function LearnThis({ concept, question }: { concept: string; question: string }) {
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function learn() {
    if (article !== null) {
      setArticle(null);
      return;
    }
    setLoading(true);
    setErr(null);
    setArticle("");
    try {
      const res = await fetch("/api/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, question }),
      });
      if (!res.ok || !res.body) {
        setErr(`Couldn't load article (${res.status}).`);
        setArticle(null);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setArticle(acc);
      }
      if (!acc) {
        setErr("Empty response. Try again.");
        setArticle(null);
      }
    } catch {
      setErr("Something went wrong.");
      setArticle(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={learn}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-lg border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:border-brand-700 dark:text-brand-300"
      >
        {loading ? (
          <>
            <MiniSpinner /> Writing…
          </>
        ) : article !== null ? (
          "▾ Hide article"
        ) : (
          "📖 Learn this topic"
        )}
      </button>
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      {article !== null && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
          <Markdown text={article} />
          {!loading && article && (
            <p className="mt-2 text-[10px] text-gray-400">Saved to your Library.</p>
          )}
        </div>
      )}
    </div>
  );
}

// "Visualize" — generates + shows a Mermaid recap diagram.
export function VisualizeThis({ concept, skill }: { concept: string; skill?: string }) {
  const [loading, setLoading] = useState(false);
  const [chart, setChart] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function visualize() {
    if (chart !== null) {
      setChart(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, skill }),
      });
      const text = await res.text();
      const j = text ? JSON.parse(text) : {};
      if (res.ok && j.diagram?.diagram) {
        setChart(j.diagram.diagram);
        setCaption(j.diagram.caption || null);
      } else setErr(j.error || `Couldn't visualize (${res.status}).`);
    } catch {
      setErr("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={visualize}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-lg border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:border-brand-700 dark:text-brand-300"
      >
        {loading ? (
          <>
            <MiniSpinner /> Drawing…
          </>
        ) : chart !== null ? (
          "▾ Hide diagram"
        ) : (
          "📊 Visualize"
        )}
      </button>
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      {chart !== null && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <Mermaid chart={chart} />
          {caption && <p className="mt-1 text-xs text-gray-500">{caption}</p>}
          <p className="mt-1 text-[10px] text-gray-400">Saved to your Library.</p>
        </div>
      )}
    </div>
  );
}

// Minimal markdown: ## headings, - bullets, **bold**, paragraphs.
