"use client";

import { useEffect, useState } from "react";
import { Landmark, Newspaper, RotateCw, BookOpen, BarChart3, ChevronRight } from "lucide-react";
import Mermaid from "./Mermaid";

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
          {news.digest ? (
            <p className="mb-3 whitespace-pre-wrap text-sm">{news.digest}</p>
          ) : (
            <p className="text-sm text-gray-500">No AI headlines surfaced today.</p>
          )}
          {news.items?.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {news.items.map((it, i) => (
                <li key={i}>
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 font-medium hover:underline"
                    style={{ color: "var(--accent)" }}
                  >
                    <ChevronRight size={14} className="shrink-0" />
                    {it.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
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
    <section className="card">
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
  // chosen[i] = selected option index, or undefined
  const [chosen, setChosen] = useState<(number | undefined)[]>(() => qs.map(() => undefined));
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // If today's quiz was already taken, restore it in reviewed state.
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
  // Which question is expanded (accordion). Default to the first.
  const [openIdx, setOpenIdx] = useState<number | null>(0);

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
      } else setErr(j.error || "Could not grade");
    } catch {
      setErr("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) return <p className="text-sm text-gray-400">Loading quiz…</p>;

  return (
    <div className="space-y-4">
      {submitted && result && (
        <div className="rounded-xl bg-brand-50 p-3 text-center dark:bg-brand-700/20">
          <span className="text-2xl font-bold text-brand-700 dark:text-brand-300">
            {result.score}/{result.total}
          </span>
          <p className="text-xs text-gray-500">
            {result.score === result.total
              ? "Perfect — difficulty goes up tomorrow."
              : "Missed concepts feed into tomorrow's quiz."}
          </p>
        </div>
      )}

      {qs.map((q, i) => {
        const pick = chosen[i];
        const open = openIdx === i;
        const answered = pick !== undefined;
        const wasRight = submitted && pick === q.correct;
        return (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border"
            style={{ borderColor: "rgba(0,0,0,0.07)" }}
          >
            {/* Collapsible header */}
            <button
              onClick={() => setOpenIdx(open ? null : i)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                style={
                  submitted
                    ? wasRight
                      ? { background: "#dcfce7", color: "#15803d" }
                      : { background: "#fee2e2", color: "#b91c1c" }
                    : answered
                    ? { background: "var(--accent-soft)", color: "var(--accent)" }
                    : { background: "rgba(0,0,0,0.05)", color: "var(--muted)" }
                }
              >
                {submitted ? (wasRight ? "✓" : "✗") : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                  {q.concept}
                </span>
                <span className={`block truncate text-sm font-medium ${open ? "whitespace-normal" : ""}`}>
                  {q.question}
                </span>
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 text-gray-400 transition-transform"
                style={{ transform: open ? "rotate(90deg)" : "none" }}
              />
            </button>

            {/* Body */}
            {open && (
              <div className="animate-fade-up px-3 pb-3">
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const isPick = pick === oi;
                    const isCorrect = oi === q.correct;
                    let cls = "w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ";
                    if (!submitted) {
                      cls += isPick
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-700/20"
                        : "border-gray-200 dark:border-gray-700";
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
                            n[i] = oi;
                            return n;
                          })
                        }
                        className={cls}
                      >
                        <span className="mr-2 font-mono text-xs text-gray-400">
                          {String.fromCharCode(65 + oi)}
                        </span>
                        {opt}
                        {submitted && isCorrect && " ✓"}
                        {submitted && isPick && !isCorrect && " ✗"}
                      </button>
                    );
                  })}
                </div>
                {submitted && (
                  <>
                    <p className="mt-2 rounded-xl bg-gray-50 p-2.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      <span className="font-semibold">Why: </span>
                      {q.explanation}
                    </p>
                    <LearnThis concept={q.concept} question={q.question} />
                    <VisualizeThis concept={q.concept} skill={q.skill} />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!submitted && (
        <div>
          <button
            onClick={submit}
            disabled={submitting || answeredCount === 0}
            className="btn-primary w-full py-2.5 disabled:opacity-60"
          >
            {submitting
              ? "Grading…"
              : `Submit quiz (${answeredCount}/${qs.length} answered)`}
          </button>
          {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        </div>
      )}
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
