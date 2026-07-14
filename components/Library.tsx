"use client";

import { useEffect, useState } from "react";
import { Calendar, Sparkles } from "lucide-react";
import { cachedGet } from "@/lib/fetch-cache";

type Day = {
  id: string;
  learn_date: string;
  summary: string;
  concepts: string[];
  score: number | null;
  total: number | null;
};

export default function Library() {
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cachedGet("/api/learning")
      .then((j) => setDays(j.days || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <span className="icon-tile h-9 w-9">
          <Sparkles size={18} />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">Learning Journal</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            What you learned, day by day
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-24 rounded-3xl" />
          <div className="skeleton h-24 rounded-3xl" />
        </div>
      ) : days.length === 0 ? (
        <div className="card text-center text-sm" style={{ color: "var(--muted)" }}>
          No learning entries yet. Take your daily quiz — each night Butler reviews it and writes
          a recap of what you learned here.
        </div>
      ) : (
        <div className="stagger space-y-3">
          {days.map((d) => (
            <section key={d.id} className="card">
              <div className="mb-2 flex items-center gap-2">
                <Calendar size={15} style={{ color: "var(--accent)" }} />
                <span className="text-sm font-semibold">{formatDate(d.learn_date)}</span>
                {d.score != null && d.total != null && (
                  <span className="chip ml-auto">
                    {d.score}/{d.total}
                  </span>
                )}
              </div>
              <Markdown text={d.summary} />
              {d.concepts?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.concepts.map((c, i) => (
                    <span
                      key={i}
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{ background: "var(--accent-soft)", color: "var(--muted)" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Minimal markdown: ## headings, - bullets, **bold**, paragraphs.
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul${out.length}`} className="my-1 list-disc pl-5 text-sm text-gray-600 dark:text-gray-300">
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return flush();
    if (line.startsWith("## ")) {
      flush();
      out.push(
        <h4 key={`h${i}`} className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">
          {line.slice(3)}
        </h4>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      list.push(line.slice(2));
    } else {
      flush();
      out.push(
        <p key={`p${i}`} className="my-1 text-sm text-gray-700 dark:text-gray-300">
          {inline(line)}
        </p>
      );
    }
  });
  flush();
  return <div>{out}</div>;
}

function inline(s: string): React.ReactNode {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}
