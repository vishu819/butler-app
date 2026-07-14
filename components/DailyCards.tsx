"use client";

import { useEffect, useState } from "react";

type QuizQ = {
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
          icon="🏛️"
          title="Daily Quiz"
          tag={`${quiz.questions.length} Q`}
          action={
            <button
              onClick={() => generateQuiz(true)}
              disabled={generating}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {generating ? "…" : "↻ Regenerate"}
            </button>
          }
        >
          <QuizRunner quiz={quiz} />
        </Card>
      ) : (
        <Card icon="🏛️" title="Daily Quiz">
          {generating ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Spinner />
              <p className="text-sm text-gray-500">Generating today&apos;s 10 questions…</p>
              <p className="text-xs text-gray-400">This takes ~10-20 seconds.</p>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="mb-3 text-sm text-gray-500">No quiz for today yet.</p>
              <button
                onClick={() => generateQuiz(false)}
                className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white active:scale-[.99]"
              >
                Generate today&apos;s quiz
              </button>
              {genErr && <p className="mt-2 text-xs text-red-500">{genErr}</p>}
            </div>
          )}
        </Card>
      )}

      {gym && (
        <Card icon="🧠" title="Brain Gym" tag={gym.kind}>
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
        <Card icon="📰" title="AI News" tag="today">
          {news.digest ? (
            <p className="mb-3 whitespace-pre-wrap text-sm">{news.digest}</p>
          ) : (
            <p className="text-sm text-gray-500">No AI headlines surfaced today.</p>
          )}
          {news.items?.length > 0 && (
            <ul className="space-y-1 text-sm">
              {news.items.map((it, i) => (
                <li key={i}>
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:underline dark:text-brand-400"
                  >
                    ↗ {it.title}
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
      className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400"
      role="status"
      aria-label="Loading"
    />
  );
}

function Card({
  icon,
  title,
  tag,
  action,
  children,
}: {
  icon: string;
  title: string;
  tag?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
        {tag && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-800">
            {tag}
          </span>
        )}
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
        return (
          <div key={i} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0 dark:border-gray-800">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-400">
              {i + 1}. {q.concept}
            </p>
            <p className="mb-2 text-sm font-medium">{q.question}</p>
            <div className="space-y-1.5">
              {q.options.map((opt, oi) => {
                const isPick = pick === oi;
                const isCorrect = oi === q.correct;
                let cls =
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ";
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
              <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <span className="font-semibold">Why: </span>
                {q.explanation}
              </p>
            )}
            <LearnThis concept={q.concept} question={q.question} />
          </div>
        );
      })}

      {!submitted && (
        <div>
          <button
            onClick={submit}
            disabled={submitting || answeredCount === 0}
            className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
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
