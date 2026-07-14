"use client";

import { useEffect, useState } from "react";
import { Landmark, Newspaper, RotateCw, BookOpen, ChevronRight, ChevronLeft } from "lucide-react";
import Mermaid from "./Mermaid";
import { toast } from "./ui/Toast";

type QuizQ = {
  skill?: string;
  concept: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
};
type Quiz = { title: string; questions: QuizQ[] };
type BrainGym = { kind: string; prompt: string; answer: string; why: string };
type News = { items: { title: string; url: string }[]; digest: string };

export default function DailyCards() {
  const [content, setContent] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/today")
      .then((r) => r.json())
      .then((j) => {
        setContent(j.content || {});
        setLoading(false);
      });
  }, []);

  async function generateQuiz(force = false) {
    setGenerating(true);
    setGenErr(null);
    // On regenerate, clear the visible quiz so QuizRunner remounts fresh.
    if (force) setContent((c) => ({ ...c, eng_q: undefined }));
    try {
      const res = await fetch(`/api/generate-quiz${force ? "?force=1" : ""}`, {
        method: "POST",
      });
      // Read as text first so an empty/non-JSON body can't throw "Unexpected end of JSON input".
      const text = await res.text();
      const j = text ? JSON.parse(text) : {};
      if (res.ok && j.quiz) {
        setContent((c) => ({ ...c, eng_q: j.quiz }));
      } else {
        setGenErr(j.error || `Generation failed (${res.status}). Please try again.`);
      }
    } catch {
      setGenErr("Something went wrong generating the quiz. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading today&apos;s content…</p>;

  const quiz = content.eng_q as Quiz | undefined;
  const gym = content.brain_gym as BrainGym | undefined;
  const news = content.news as News | undefined;

  return (
    <div className="space-y-4">
      {/* Quiz: show it, or a generate/loader state */}
      {quiz && quiz.questions?.length > 0 ? (
        <Card
          Icon={Landmark}
          title="Daily Quiz"
          tag={`${quiz.questions.length} Q`}
          action={
            <button
              onClick={() => generateQuiz(true)}
              disabled={generating}
              className="btn-ghost flex items-center gap-1 !px-2.5 !py-1 text-xs disabled:opacity-50"
            >
              <RotateCw size={13} className={generating ? "animate-spin" : ""} />
              {generating ? "" : "Regenerate"}
            </button>
          }
        >
          <QuizRunner quiz={quiz} />
        </Card>
      ) : (
        <Card Icon={Landmark} title="Daily Quiz">
          {generating ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Spinner />
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Generating today&apos;s 10 questions…
              </p>
              <p className="text-xs text-gray-400">This takes ~10-20 seconds.</p>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
                No quiz for today yet.
              </p>
              <button onClick={() => generateQuiz(false)} className="btn-primary">
                Generate today&apos;s quiz
              </button>
              {genErr && <p className="mt-2 text-xs text-red-500">{genErr}</p>}
            </div>
          )}
        </Card>
      )}

      {gym && (
        <Card Icon={BookOpen} title="Brain Gym" tag={gym.kind}>
          <p className="mb-2 font-medium">{gym.prompt}</p>
          <Reveal label="Answer">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {gym.answer}
              {gym.why && <span className="block mt-1 italic">{gym.why}</span>}
            </p>
          </Reveal>
        </Card>
      )}

      {news && (
        <Card Icon={Newspaper} title="AI News" tag="today">
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
          {!news.digest && !news.items?.length && (
            <p className="text-sm text-gray-500">No AI headlines surfaced today.</p>
          )}
        </Card>
      )}
    </div>
  );
}

// Split a digest blob into clean bullet lines (handles "- ", "• ", or newlines).
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

function Spinner() {
  return (
    <div
      className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
      style={{ borderColor: "var(--accent-soft)", borderTopColor: "var(--accent)" }}
      role="status"
      aria-label="Loading"
    />
  );
}

function Card({
  Icon,
  title,
  tag,
  action,
  children,
}: {
  Icon: React.ComponentType<any>;
  title: string;
  tag?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card lift">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="icon-tile h-9 w-9">
          <Icon size={18} />
        </span>
        <h2 className="font-semibold">{title}</h2>
        {tag && <span className="chip">{tag}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function QuizRunner({ quiz }: { quiz: Quiz }) {
  const qs = quiz.questions;
  const [chosen, setChosen] = useState<(number | undefined)[]>(() => qs.map(() => undefined));
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Flashcard paging: index of the current card.
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetch("/api/quiz")
      .then((r) => r.json())
      .then((j) => {
        if (j.result) {
          const ans = (j.result.answers || []) as { qi: number; chosen: number | null }[];
          const restored = qs.map((_, i) => {
            const a = ans.find((x) => x.qi === i);
            return a && a.chosen != null ? a.chosen : undefined;
          });
          setChosen(restored);
          setResult({ score: j.result.score, total: j.result.total });
          setSubmitted(true);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answeredCount = chosen.filter((c) => c !== undefined).length;
  const isLast = idx === qs.length - 1;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chosen: chosen.map((c) => (c === undefined ? -1 : c)) }),
      });
      const j = await res.json();
      if (typeof j.score === "number") {
        setResult({ score: j.score, total: j.total });
        setSubmitted(true);
        setIdx(0); // start review at the first card
        toast(
          `Scored ${j.score}/${j.total}`,
          j.score >= j.total * 0.7 ? "good" : "info"
        );
      } else setErr(j.error || "Could not grade");
    } catch {
      setErr("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) return <p className="text-sm text-gray-400">Loading quiz…</p>;

  const q = qs[idx];
  const pick = chosen[idx];
  const wasRight = submitted && pick === q.correct;

  return (
    <div className="space-y-3">
      {/* Result banner (review mode) */}
      {submitted && result && (
        <div
          className="rounded-2xl p-3 text-center"
          style={{ background: "var(--accent-soft)" }}
        >
          <span className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
            {result.score}/{result.total}
          </span>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {result.score === result.total
              ? "Perfect — difficulty goes up tomorrow."
              : "Missed concepts feed into tomorrow's quiz."}
          </p>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${((idx + 1) / qs.length) * 100}%`,
              background: "linear-gradient(90deg,#c9a86a,#a97f45)",
            }}
          />
        </div>
        <span className="text-xs font-medium tabular-nums" style={{ color: "var(--muted)" }}>
          {idx + 1}/{qs.length}
        </span>
      </div>

      {/* The single question card */}
      <div key={idx} className="animate-pop">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">{q.concept}</span>
          {submitted && (
            <span
              className="ml-auto rounded-lg px-1.5 py-0.5 text-[10px] font-bold"
              style={
                wasRight
                  ? { background: "#dcfce7", color: "#15803d" }
                  : { background: "#fee2e2", color: "#b91c1c" }
              }
            >
              {wasRight ? "Correct" : "Missed"}
            </span>
          )}
        </div>
        <p className="mb-3 text-[15px] font-semibold leading-snug">{q.question}</p>

        <div className="space-y-2">
          {q.options.map((opt, oi) => {
            const isPick = pick === oi;
            const isCorrect = oi === q.correct;
            let cls = "flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all ";
            if (!submitted) {
              cls += isPick
                ? "border-brand-500 bg-brand-50 dark:bg-brand-700/20"
                : "border-gray-200 active:scale-[.99] dark:border-gray-700";
            } else if (isCorrect) {
              cls += "border-green-500 bg-green-50 dark:bg-green-900/20";
            } else if (isPick) {
              cls += "border-red-400 bg-red-50 dark:bg-red-900/20";
            } else {
              cls += "border-gray-200 opacity-60 dark:border-gray-700";
            }
            return (
              <button
                key={oi}
                disabled={submitted}
                onClick={() =>
                  setChosen((c) => {
                    const n = [...c];
                    n[idx] = oi;
                    return n;
                  })
                }
                className={cls}
              >
                <span className="mt-0.5 font-mono text-xs text-gray-400">
                  {String.fromCharCode(65 + oi)}
                </span>
                <span className="flex-1">{opt}</span>
                {submitted && isCorrect && <span className="text-green-600">✓</span>}
                {submitted && isPick && !isCorrect && <span className="text-red-500">✗</span>}
              </button>
            );
          })}
        </div>

        {submitted && (
          <>
            <p className="mt-3 rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <span className="font-semibold">Why: </span>
              {q.explanation}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <LearnThis concept={q.concept} question={q.question} />
              <VisualizeThis concept={q.concept} skill={q.skill} />
            </div>
          </>
        )}
      </div>

      {/* Nav controls */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="btn-ghost flex items-center gap-1 disabled:opacity-40"
        >
          <ChevronLeft size={15} /> Back
        </button>

        {!submitted && isLast ? (
          <button
            onClick={submit}
            disabled={submitting || answeredCount === 0}
            className="btn-primary flex-1 py-2.5 disabled:opacity-60"
          >
            {submitting ? "Grading…" : `Submit (${answeredCount}/${qs.length})`}
          </button>
        ) : (
          <button
            onClick={() => setIdx((i) => Math.min(qs.length - 1, i + 1))}
            disabled={isLast}
            className="btn-primary flex flex-1 items-center justify-center gap-1 py-2.5 disabled:opacity-40"
          >
            Next <ChevronRight size={15} />
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}

      {/* Quick dot-jump */}
      <div className="flex flex-wrap justify-center gap-1.5 pt-1">
        {qs.map((_, i) => {
          const done = chosen[i] !== undefined;
          const active = i === idx;
          return (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Question ${i + 1}`}
              className="h-2 rounded-full transition-all"
              style={{
                width: active ? 16 : 8,
                background: active
                  ? "var(--accent)"
                  : submitted
                  ? chosen[i] === qs[i].correct
                    ? "#22c55e"
                    : "#ef4444"
                  : done
                  ? "var(--accent-soft)"
                  : "rgba(0,0,0,0.12)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function LearnThis({ concept, question }: { concept: string; question: string }) {
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function learn() {
    if (article !== null) {
      setArticle(null); // toggle closed
      return;
    }
    setLoading(true);
    setErr(null);
    setArticle(""); // open the panel; fills as it streams
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
        setErr("Empty response. Please try again.");
        setArticle(null);
      }
    } catch {
      setErr("Something went wrong. Please try again.");
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
        className="inline-flex items-center gap-1 rounded-lg border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-700/20"
      >
        {loading ? (
          <>
            <MiniSpinner /> Writing article…
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

function MiniSpinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-brand-300 border-t-brand-600" />
  );
}

// "Visualize" — generate a Mermaid recap diagram for the concept, saved to Library.
function VisualizeThis({ concept, skill }: { concept: string; skill?: string }) {
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
      setErr("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={visualize}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-lg border border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-700/20"
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

// Minimal Markdown renderer: ## headings, - bullets, **bold**, paragraphs.
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`ul${out.length}`} className="my-1 list-disc pl-5 text-xs text-gray-600 dark:text-gray-300">
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
    if (!line) {
      flush();
      return;
    }
    if (line.startsWith("## ")) {
      flush();
      out.push(
        <h4 key={`h${i}`} className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">
          {line.slice(3)}
        </h4>
      );
    } else if (line.startsWith("# ")) {
      flush();
      out.push(
        <h3 key={`h${i}`} className="text-sm font-bold">
          {line.slice(2)}
        </h3>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      list.push(line.slice(2));
    } else {
      flush();
      out.push(
        <p key={`p${i}`} className="my-1 text-xs text-gray-700 dark:text-gray-300">
          {inline(line)}
        </p>
      );
    }
  });
  flush();
  return <div>{out}</div>;
}

// Handle **bold** inside a line.
function inline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function Reveal({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-brand-600 dark:text-brand-400"
      >
        {open ? "▾" : "▸"} {label}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}
