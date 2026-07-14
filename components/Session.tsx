"use client";

import { useEffect, useState } from "react";
import { ChevronRight, HelpCircle, Sparkles } from "lucide-react";
import { toast } from "./ui/Toast";
import { invalidate } from "@/lib/fetch-cache";
import SessionResults from "./viz/SessionResults";
import { LearnThis, VisualizeThis } from "./viz/LearnVisualize";

type Q = {
  skill: string;
  level: number;
  concept: string;
  question: string;
  options: string[];
  followup_prompt: string;
  correct?: number;
  explanation?: string;
};
type Resp = {
  qi: number;
  chosen: number | null;
  followup_text: string;
  mcq_correct: boolean;
  followup_score: number;
  feedback: string;
};

export default function Session() {
  const [questions, setQuestions] = useState<Q[]>([]);
  const [responses, setResponses] = useState<Resp[]>([]);
  const [focus, setFocus] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("active");
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState<{
    narrative?: string;
    leveled?: string[];
    downgraded?: string[];
    verdicts?: { skill: string; verdict: string; reasoning: string }[];
  } | null>(null);

  // per-question local state
  const [chosen, setChosen] = useState<number | null>(null);
  const [followup, setFollowup] = useState("");
  const [phase, setPhase] = useState<"mcq" | "followup" | "reviewed">("mcq");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ correct: number; explanation: string } | null>(null);
  const [judge, setJudge] = useState<{ score: number; feedback: string } | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/session")
      .then((r) => r.json())
      .then((j) => {
        if (j.session) {
          setQuestions(j.session.questions || []);
          setResponses(j.session.responses || []);
          setFocus(j.session.focus_skills || []);
          setStatus(j.session.status || "active");
        }
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  // Process the completed session into the profile (idempotent, retryable).
  async function runProcess() {
    setProcessing(true);
    setErr(null);
    try {
      const res = await fetch("/api/session/process", { method: "POST" });
      const j = await res.json();
      if (j.status === "processed") {
        // Progress/plan changed — clear their caches so the tabs show fresh data.
        invalidate("/api/profile");
        invalidate("/api/plan");
        setProcessed({
          narrative: j.narrative,
          leveled: j.leveled,
          downgraded: j.downgraded,
          verdicts: j.verdicts,
        });
        const msg = j.leveled?.length
          ? `Leveled up: ${j.leveled.join(", ")} 🎉`
          : j.downgraded?.length
          ? `Eased back: ${j.downgraded.join(", ")} — let's solidify basics`
          : "Progress saved";
        toast(msg, j.downgraded?.length ? "info" : "good");
      } else {
        setErr(j.error || "Couldn't save progress");
      }
    } catch {
      setErr("Couldn't reach the analyzer. Tap to retry.");
    } finally {
      setProcessing(false);
    }
  }

  // When moving to a question, restore its answered state if present.
  useEffect(() => {
    const r = responses.find((x) => x.qi === idx);
    if (r) {
      setChosen(r.chosen);
      setFollowup(r.followup_text);
      setJudge({ score: r.followup_score, feedback: r.feedback });
      setReveal(questions[idx]?.explanation != null ? { correct: questions[idx].correct!, explanation: questions[idx].explanation! } : null);
      setPhase("reviewed");
    } else {
      setChosen(null);
      setFollowup("");
      setJudge(null);
      setReveal(null);
      setPhase("mcq");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, questions, responses]);

  async function generate() {
    setGenerating(true);
    setErr(null);
    try {
      const res = await fetch("/api/session", { method: "POST" });
      const text = await res.text();
      const j = text ? JSON.parse(text) : {};
      if (res.ok) load();
      else setErr(j.error || `Couldn't start session (${res.status}).`);
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function submitAnswer() {
    if (chosen === null || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/session/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qi: idx, chosen, followup }),
      });
      const j = await res.json();
      if (j.reveal) {
        setReveal(j.reveal);
        setJudge({ score: j.response.followup_score, feedback: j.response.feedback });
        setResponses((rs) => [...rs.filter((r) => r.qi !== idx), j.response]);
        setPhase("reviewed");
        if (j.complete) {
          setStatus("complete");
          toast("Session complete! Analyzing…", "good");
          runProcess();
        }
      } else setErr(j.error || "Grading failed");
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function reframe() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/session/reframe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qi: idx }),
      });
      const j = await res.json();
      if (j.question) {
        setQuestions((qs) => {
          const n = [...qs];
          n[idx] = { ...n[idx], ...j.question };
          return n;
        });
        setChosen(null);
        toast("Reworded");
      } else setErr(j.error || "Couldn't reword");
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading today&apos;s session…</p>;

  // No session yet
  if (questions.length === 0) {
    return (
      <div className="card animate-fade-up text-center">
        <span className="icon-tile mx-auto mb-3 h-12 w-12">
          <Sparkles size={22} />
        </span>
        <h2 className="mb-1 font-semibold">Today&apos;s learning session</h2>
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Butler will focus on your two weakest areas today, at a depth that fits where you are —
          building toward architect level a little each day.
        </p>
        <button onClick={generate} disabled={generating} className="btn-primary">
          {generating ? "Preparing your session…" : "Start today's session"}
        </button>
        {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
      </div>
    );
  }

  const q = questions[idx];

  const answeredCount = responses.length;
  const allAnswered = answeredCount >= questions.length;

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Completion / analysis banner */}
      {status === "complete" && (
        <div className="card" style={{ background: "var(--good-soft)" }}>
          {processing ? (
            <p className="text-sm font-medium" style={{ color: "var(--good)" }}>
              Analyzing your session…
            </p>
          ) : processed ? (
            <>
              <p className="text-sm font-semibold" style={{ color: "var(--good)" }}>
                ✓ Session complete — progress saved
                {processed.leveled?.length ? ` · Leveled up: ${processed.leveled.join(", ")}` : ""}
              </p>
              {processed.narrative && (
                <p className="mt-1 text-xs" style={{ color: "var(--ink)" }}>
                  {processed.narrative}
                </p>
              )}
              {/* Butler's per-skill verdict + WHY */}
              {processed.verdicts && processed.verdicts.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {processed.verdicts.map((v, i) => (
                    <div key={i} className="rounded-lg bg-white/60 p-2 text-xs dark:bg-black/20">
                      <span
                        className="mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                        style={
                          v.verdict === "advance"
                            ? { background: "var(--good-soft)", color: "var(--good)" }
                            : v.verdict === "downgrade"
                            ? { background: "var(--bad-soft)", color: "var(--bad)" }
                            : { background: "var(--warn-soft)", color: "var(--warn)" }
                        }
                      >
                        {v.skill}: {v.verdict}
                      </span>
                      <span style={{ color: "var(--muted)" }}>{v.reasoning}</span>
                    </div>
                  ))}
                </div>
              )}
              <SessionResults questions={questions} responses={responses} />
            </>
          ) : (
            <button onClick={runProcess} className="text-sm font-medium" style={{ color: "var(--good)" }}>
              Session complete — tap to save progress ↻
            </button>
          )}
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="bar flex-1">
          <span style={{ width: `${((idx + 1) / questions.length) * 100}%`, background: "linear-gradient(90deg,#c9a86a,#a97f45)" }} />
        </div>
        <span className="text-xs font-medium tabular-nums" style={{ color: "var(--muted)" }}>
          {idx + 1}/{questions.length} · {answeredCount} answered
        </span>
      </div>

      <div key={idx} className="card animate-pop">
        <div className="mb-2 flex items-center gap-2">
          <span className="chip">{q.concept}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            Lv {q.level}
          </span>
        </div>
        <p className="mb-3 text-[15px] font-semibold leading-snug">{q.question}</p>

        {/* MCQ options */}
        <div className="space-y-2">
          {q.options.map((opt, oi) => {
            const isPick = chosen === oi;
            const isCorrect = reveal && oi === reveal.correct;
            const isWrongPick = reveal && isPick && oi !== reveal.correct;
            let style: React.CSSProperties = { borderColor: "rgba(0,0,0,0.1)" };
            if (!reveal && isPick) style = { borderColor: "var(--accent)", background: "var(--accent-soft)" };
            else if (isCorrect) style = { borderColor: "var(--good)", background: "var(--good-soft)" };
            else if (isWrongPick) style = { borderColor: "var(--bad)", background: "var(--bad-soft)" };
            return (
              <button
                key={oi}
                disabled={phase !== "mcq"}
                onClick={() => setChosen(oi)}
                className="flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all active:scale-[.99]"
                style={style}
              >
                <span className="mt-0.5 font-mono text-xs text-gray-400">{String.fromCharCode(65 + oi)}</span>
                <span className="flex-1">{opt}</span>
                {isCorrect && <span style={{ color: "var(--good)" }}>✓</span>}
                {isWrongPick && <span style={{ color: "var(--bad)" }}>✗</span>}
              </button>
            );
          })}
        </div>

        {/* MCQ phase controls */}
        {phase === "mcq" && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={reframe}
              disabled={busy}
              className="btn-ghost flex items-center gap-1 text-xs"
            >
              <HelpCircle size={14} /> Didn&apos;t get it
            </button>
            <button
              onClick={() => setPhase("followup")}
              disabled={chosen === null}
              className="btn-primary flex-1 py-2 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {/* Follow-up phase */}
        {(phase === "followup" || phase === "reviewed") && (
          <div className="mt-4 border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            <p className="mb-2 text-sm font-medium">{q.followup_prompt}</p>
            <textarea
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              disabled={phase === "reviewed"}
              rows={3}
              placeholder="Explain your reasoning in 2-3 sentences…"
              className="w-full resize-y rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 disabled:opacity-70 dark:bg-gray-950"
              style={{ borderColor: "rgba(0,0,0,0.12)" }}
            />
            {phase === "followup" && (
              <button
                onClick={submitAnswer}
                disabled={busy}
                className="btn-primary mt-2 w-full py-2 disabled:opacity-60"
              >
                {busy ? "Checking…" : "Submit answer"}
              </button>
            )}
          </div>
        )}

        {/* Review */}
        {phase === "reviewed" && (
          <div className="mt-3 space-y-2">
            {judge && (
              <div className="rounded-xl p-3 text-sm" style={{ background: "var(--accent-soft)" }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-bold" style={{ color: "var(--accent)" }}>
                    {judge.score}/100
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    on your explanation
                  </span>
                </div>
                {judge.feedback && <p style={{ color: "var(--ink)" }}>{judge.feedback}</p>}
              </div>
            )}
            {reveal && (
              <p className="rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <span className="font-semibold">Why: </span>
                {reveal.explanation}
              </p>
            )}
            {/* Go deeper on this concept */}
            <div className="flex flex-wrap gap-2">
              <LearnThis concept={q.concept} question={q.question} />
              <VisualizeThis concept={q.concept} skill={q.skill} />
            </div>
          </div>
        )}
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      {/* Nav */}
      <div className="flex justify-between">
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="btn-ghost disabled:opacity-40"
        >
          Back
        </button>
        <button
          onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
          disabled={idx === questions.length - 1}
          className="btn-primary flex items-center gap-1 disabled:opacity-40"
        >
          Next <ChevronRight size={15} />
        </button>
      </div>

      {/* Safety net: all answered but not yet saved (e.g. answered out of order) */}
      {allAnswered && status !== "complete" && !processed && (
        <button onClick={runProcess} disabled={processing} className="btn-primary w-full py-2.5">
          {processing ? "Analyzing…" : "Finish & save progress"}
        </button>
      )}

      {/* Jump dots — show which questions still need answering */}
      <div className="flex flex-wrap justify-center gap-1.5 pt-1">
        {questions.map((_, i) => {
          const done = responses.some((r) => r.qi === i);
          const active = i === idx;
          return (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Question ${i + 1}`}
              className="h-2 rounded-full transition-all"
              style={{
                width: active ? 16 : 8,
                background: active ? "var(--accent)" : done ? "var(--good)" : "rgba(0,0,0,0.15)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
