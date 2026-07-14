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

  useEffect(() => {
    fetch("/api/today")
      .then((r) => r.json())
      .then((j) => {
        setContent(j.content || {});
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Loading today&apos;s content…</p>;

  const quiz = content.eng_q as Quiz | undefined;
  const gym = content.brain_gym as BrainGym | undefined;
  const news = content.news as News | undefined;

  const empty = !quiz && !gym && !news;

  return (
    <div className="space-y-4">
      {empty && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-900/20">
          No daily content yet for today. Trigger the generator once (see README) — after that
          Vercel Cron fills it automatically each morning.
        </div>
      )}

      {quiz && quiz.questions?.length > 0 && (
        <Card icon="🏛️" title="Daily Quiz" tag={`${quiz.questions.length} Q`}>
          <QuizRunner quiz={quiz} />
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

function Card({
  icon,
  title,
  tag,
  children,
}: {
  icon: string;
  title: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
        {tag && (
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-gray-800">
            {tag}
          </span>
        )}
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
