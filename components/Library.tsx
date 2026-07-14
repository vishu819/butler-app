"use client";

import { useEffect, useState } from "react";
import { Calendar, Sparkles, Trash2 } from "lucide-react";
import Mermaid from "./Mermaid";
import { cachedGet, invalidate } from "@/lib/fetch-cache";
import { toast } from "./ui/Toast";

type Day = { id: string; learn_date: string; summary: string; concepts: string[]; score: number | null; total: number | null };
type Article = { id: string; concept: string; article: string; created_at: string };
type Diagram = { id: string; concept: string; diagram: string; caption: string | null; created_at: string };

type Tab = "journal" | "topics" | "diagrams";

export default function Library() {
  const [tab, setTab] = useState<Tab>("journal");
  const [days, setDays] = useState<Day[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      cachedGet("/api/learning").then((j) => setDays(j.days || [])),
      cachedGet("/api/learn").then((j) => setArticles(j.articles || [])),
      cachedGet("/api/diagram").then((j) => setDiagrams(j.diagrams || [])),
    ]).finally(() => setLoading(false));
  }, []);

  async function removeArticle(id: string) {
    setArticles((a) => a.filter((x) => x.id !== id));
    invalidate("/api/learn");
    toast("Removed");
    await fetch("/api/learn", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  }
  async function removeDiagram(id: string) {
    setDiagrams((d) => d.filter((x) => x.id !== id));
    invalidate("/api/diagram");
    toast("Removed");
    await fetch("/api/diagram", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <span className="icon-tile h-9 w-9">
          <Sparkles size={18} />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">Library</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Your learning journal, topics, and diagrams
          </p>
        </div>
      </div>

      <div className="segmented">
        <button data-active={tab === "journal"} onClick={() => setTab("journal")}>Journal</button>
        <button data-active={tab === "topics"} onClick={() => setTab("topics")}>Topics</button>
        <button data-active={tab === "diagrams"} onClick={() => setTab("diagrams")}>Diagrams</button>
      </div>

      {loading ? (
        <div className="skeleton h-24 rounded-3xl" />
      ) : tab === "journal" ? (
        days.length === 0 ? (
          <Empty text="No journal entries yet. Each day Butler recaps what you learned here." />
        ) : (
          <div className="space-y-3">
            {days.map((d) => (
              <section key={d.id} className="card">
                <div className="mb-2 flex items-center gap-2">
                  <Calendar size={15} style={{ color: "var(--accent)" }} />
                  <span className="text-sm font-semibold">{formatDate(d.learn_date)}</span>
                  {d.score != null && d.total != null && <span className="chip ml-auto">{d.score}/{d.total}</span>}
                </div>
                <Markdown text={d.summary} />
              </section>
            ))}
          </div>
        )
      ) : tab === "topics" ? (
        articles.length === 0 ? (
          <Empty text="No saved topics yet. Tap “Learn this topic” on a session question to save it here." />
        ) : (
          <div className="space-y-3">
            {articles.map((a) => (
              <details key={a.id} className="card">
                <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                  <span className="flex-1">{a.concept}</span>
                  <button
                    onClick={(e) => { e.preventDefault(); removeArticle(a.id); }}
                    aria-label="Remove"
                    className="rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <Trash2 size={15} />
                  </button>
                </summary>
                <div className="mt-2"><Markdown text={a.article} /></div>
              </details>
            ))}
          </div>
        )
      ) : diagrams.length === 0 ? (
        <Empty text="No diagrams yet. Tap “Visualize” on a session question to save one here." />
      ) : (
        <div className="space-y-3">
          {diagrams.map((d) => (
            <section key={d.id} className="card">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex-1 font-semibold">{d.concept}</span>
                <button
                  onClick={() => removeDiagram(d.id)}
                  aria-label="Remove"
                  className="rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {d.caption && <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>{d.caption}</p>}
              <Mermaid chart={d.diagram} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="card text-center text-sm" style={{ color: "var(--muted)" }}>{text}</div>;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(<ul key={`ul${out.length}`} className="my-1 list-disc pl-5 text-sm text-gray-600 dark:text-gray-300">{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return flush();
    if (line.startsWith("## ")) { flush(); out.push(<h4 key={`h${i}`} className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">{line.slice(3)}</h4>); }
    else if (line.startsWith("- ") || line.startsWith("* ")) list.push(line.slice(2));
    else { flush(); out.push(<p key={`p${i}`} className="my-1 text-sm text-gray-700 dark:text-gray-300">{inline(line)}</p>); }
  });
  flush();
  return <div>{out}</div>;
}
function inline(s: string): React.ReactNode {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
}
