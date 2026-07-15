"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, HelpCircle, RotateCw, Sparkles } from "lucide-react";
import { toast } from "./ui/Toast";
import { invalidate } from "@/lib/fetch-cache";
import SessionResults from "./viz/SessionResults";
import { LearnThis, VisualizeThis } from "./viz/LearnVisualize";

type FUMCQ = { q: string; options: string[]; correct?: number; explanation?: string };
type Q = {
  skill: string;
  level: number;
  concept: string;
  question: string;
  options: string[];
  followup_prompt: string;
  followup_mcqs?: FUMCQ[];
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
  graded?: boolean;
};

export default function Session() {
  const [questions, setQuestions] = useState<Q[]>([]);
  const [responses, setResponses] = useState<Resp[]>([]);
  const [focus, setFocus] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false); // collapsed summary vs. expanded question flow
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
  const [judge, setJudge] = useState<{ score: number; feedback: string; graded?: boolean } | null>(null);
  const [regrading, setRegrading] = useState(false);
  // Follow-up MCQs: the revealed answers, plus tentative (draft) picks and the
  // confirmed picks. Draft = changeable; confirmed (fuPicks) = locked + graded.
  const [fuMcqs, setFuMcqs] = useState<FUMCQ[]>([]);
  const [fuPicks, setFuPicks] = useState<Record<number, number>>({});
  const [fuDraft, setFuDraft] = useState<Record<number, number>>({});

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
      setJudge({ score: r.followup_score, feedback: r.feedback, graded: r.graded !== false });
      setReveal(questions[idx]?.explanation != null ? { correct: questions[idx].correct!, explanation: questions[idx].explanation! } : null);
      // Restore revealed follow-up MCQs (present once the question is answered).
      setFuMcqs(questions[idx]?.followup_mcqs || []);
      setFuPicks((r as any).fu_picks || {});
      setFuDraft((r as any).fu_picks || {}); // confirmed picks are their own draft
      setPhase("reviewed");
    } else {
      setChosen(null);
      setFollowup("");
      setJudge(null);
      setReveal(null);
      setFuMcqs([]);
      setFuPicks({});
      setFuDraft({});
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
        setJudge({ score: j.response.followup_score, feedback: j.response.feedback, graded: j.response.graded !== false });
        setFuMcqs(j.reveal.followup_mcqs || []);
        setFuPicks({});
        setFuDraft({});
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

  // Re-run the LLM grade for the current question when it fell back last time.
  async function regrade() {
    if (regrading) return;
    setRegrading(true);
    try {
      const res = await fetch("/api/session/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qi: idx, chosen, followup }),
      });
      const j = await res.json();
      if (j.response) {
        setJudge({ score: j.response.followup_score, feedback: j.response.feedback, graded: j.response.graded !== false });
        setResponses((rs) => [...rs.filter((r) => r.qi !== idx), j.response]);
        if (j.response.graded !== false) toast("Graded ✓", "good");
        else toast("Still couldn't grade — try again in a moment", "info");
        // Progression depends on the grade; refresh it if the session is done.
        if (status === "complete") runProcess();
      } else {
        toast("Couldn't reach the grader", "bad");
      }
    } catch {
      toast("Network error", "bad");
    } finally {
      setRegrading(false);
    }
  }

  // Tentatively select a follow-up option (changeable until confirmed). Tapping
  // the same option again clears it — lets you undo an accidental pick.
  function draftFollowup(fi: number, oi: number) {
    if (fuPicks[fi] !== undefined) return; // already locked
    setFuDraft((d) => {
      if (d[fi] === oi) {
        const next = { ...d };
        delete next[fi]; // tap same option again to clear an accidental pick
        return next;
      }
      return { ...d, [fi]: oi };
    });
  }

  // Confirm a follow-up: lock it in, grade it, and persist so it survives
  // navigation and feeds the reinforcement judge. Fire-and-forget on the network.
  function confirmFollowup(fi: number) {
    const oi = fuDraft[fi];
    if (oi === undefined || fuPicks[fi] !== undefined) return;
    const next = { ...fuPicks, [fi]: oi };
    setFuPicks(next);
    fetch("/api/session/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qi: idx, fu_picks: next }),
    }).catch(() => {});
    setResponses((rs) => rs.map((r) => (r.qi === idx ? { ...r, fu_picks: next } : r)));
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

  if (loading) return <div className="skeleton h-24 rounded-3xl" />;

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
  const remaining = questions.length - answeredCount;

  // Collapsed summary card — lime "Today's session" with an arrow (matches render).
  // Shown until the user opens the flow. Once complete, we skip straight to the
  // expanded view so the analysis banner is visible.
  if (!open && status !== "complete") {
    const done = answeredCount > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        className="card-lime flex w-full items-center justify-between text-left transition-transform active:scale-[.99] animate-fade-up"
      >
        <div>
          <p className="text-xs font-medium" style={{ color: "var(--accent-soft-ink)" }}>
            Today&apos;s session
          </p>
          <p className="mt-0.5 text-lg font-bold leading-tight">
            {done ? `${remaining} question${remaining === 1 ? "" : "s"} left` : `${questions.length} questions ready`}
          </p>
          {done && (
            <div className="mt-2 flex items-center gap-2">
              <div
                className="h-1.5 w-28 overflow-hidden rounded-full"
                style={{ background: "rgba(26,26,18,0.15)" }}
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(answeredCount / questions.length) * 100}%`, background: "var(--accent-ink)" }}
                />
              </div>
              <span className="text-xs font-semibold" style={{ color: "var(--accent-soft-ink)" }}>
                {answeredCount}/{questions.length}
              </span>
            </div>
          )}
        </div>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--charcoal)", color: "var(--accent-bright)" }}
        >
          <ArrowRight size={19} />
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Collapse back to the summary card */}
      {status !== "complete" && (
        <button
          onClick={() => setOpen(false)}
          className="text-xs font-medium"
          style={{ color: "var(--muted)" }}
        >
          ← Collapse
        </button>
      )}
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
          <span style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
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
        <p className="mb-3 text-[15px] font-medium leading-snug">{q.question}</p>

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
                // Tap again to deselect an accidental pick. Locks after Continue.
                onClick={() => setChosen((c) => (c === oi ? null : oi))}
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
              judge.graded === false ? (
                // Grading fell back — offer a retry instead of a misleading score.
                <div className="rounded-xl p-3 text-sm" style={{ background: "var(--warn-soft)" }}>
                  <p className="mb-2" style={{ color: "var(--ink)" }}>
                    Answer saved — automatic grading was unavailable this time.
                  </p>
                  <button
                    onClick={regrade}
                    disabled={regrading}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: "var(--charcoal)", color: "var(--accent-bright)" }}
                  >
                    <RotateCw size={13} className={regrading ? "animate-spin" : ""} />
                    {regrading ? "Grading…" : "Retry grading"}
                  </button>
                </div>
              ) : (
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
              )
            )}
            {reveal && (
              <p className="rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <span className="font-semibold">Why: </span>
                {reveal.explanation}
              </p>
            )}

            {/* Deeper follow-up MCQs on the same concept (graded locally) */}
            {fuMcqs.length > 0 && (
              <div className="space-y-2.5 pt-1">
                <p className="section-label">Go deeper · {Object.keys(fuPicks).length}/{fuMcqs.length}</p>
                {fuMcqs.map((fm, fi) => {
                  const confirmed = fuPicks[fi];
                  const locked = confirmed !== undefined;
                  const draft = fuDraft[fi];
                  return (
                    <div key={fi} className="rounded-xl border p-3" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
                      <p className="mb-2 text-sm font-medium">{fm.q}</p>
                      <div className="space-y-1.5">
                        {fm.options.map((opt, oi) => {
                          const isDraft = !locked && draft === oi;
                          const isCorrect = locked && oi === fm.correct;
                          const isWrongPick = locked && confirmed === oi && oi !== fm.correct;
                          let style: React.CSSProperties = { borderColor: "rgba(0,0,0,0.1)" };
                          if (isDraft) style = { borderColor: "var(--accent)", background: "var(--accent-soft)" };
                          else if (isCorrect) style = { borderColor: "var(--good)", background: "var(--good-soft)" };
                          else if (isWrongPick) style = { borderColor: "var(--bad)", background: "var(--bad-soft)" };
                          return (
                            <button
                              key={oi}
                              disabled={locked}
                              onClick={() => draftFollowup(fi, oi)}
                              className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all active:scale-[.99] disabled:cursor-default"
                              style={style}
                            >
                              <span className="flex-1">{opt}</span>
                              {isCorrect && <span style={{ color: "var(--good)" }}>✓</span>}
                              {isWrongPick && <span style={{ color: "var(--bad)" }}>✗</span>}
                            </button>
                          );
                        })}
                      </div>
                      {/* Check button: appears once a tentative option is picked, before locking */}
                      {!locked && draft !== undefined && (
                        <button
                          onClick={() => confirmFollowup(fi)}
                          className="btn-primary mt-2 px-4 py-1.5 text-xs"
                        >
                          Check
                        </button>
                      )}
                      {locked && fm.explanation && (
                        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                          {fm.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
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
