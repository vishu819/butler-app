"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Timer, Zap } from "lucide-react";
import { toast } from "./ui/Toast";

type MCQ = { q: string; options: string[]; correct: number };
type Phase = "idle" | "loading" | "playing" | "done";

const CATS: { key: string; label: string }[] = [
  { key: "mixed", label: "Mixed" },
  { key: "memory", label: "Memory" },
  { key: "logic", label: "Logic" },
  { key: "spatial", label: "Spatial" },
  { key: "pattern", label: "Pattern" },
  { key: "mental_math", label: "Mental Math" },
  { key: "verbal", label: "Verbal" },
  { key: "attention", label: "Attention" },
];

const ROUND_SECONDS = 60;

export default function BrainGym() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [category, setCategory] = useState("mixed");
  const [questions, setQuestions] = useState<MCQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [remaining, setRemaining] = useState(ROUND_SECONDS);
  const [picked, setPicked] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadCounts();
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, []);

  async function loadCounts() {
    try {
      const r = await fetch("/api/brain-gym/log");
      const j = await r.json();
      setCounts(j.counts || {});
    } catch {
      /* ignore */
    }
  }

  async function start(cat: string) {
    setCategory(cat);
    setPhase("loading");
    setErr(null);
    try {
      const res = await fetch("/api/brain-gym/round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat }),
      });
      const text = await res.text();
      const j = text ? JSON.parse(text) : {};
      if (res.ok && j.questions?.length) {
        setQuestions(j.questions);
        setIdx(0);
        setScore(0);
        setPicked(null);
        setPhase("playing");
        beginTimer();
      } else {
        setErr(j.error || "Couldn't start round.");
        setPhase("idle");
      }
    } catch {
      setErr("Something went wrong.");
      setPhase("idle");
    }
  }

  function beginTimer() {
    if (tick.current) clearInterval(tick.current);
    setRemaining(ROUND_SECONDS);
    tick.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (tick.current) clearInterval(tick.current);
          finish();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  function answer(oi: number) {
    if (picked !== null) return;
    setPicked(oi);
    const correct = oi === questions[idx].correct;
    if (correct) setScore((s) => s + 1);
    // brief reveal, then advance
    setTimeout(() => {
      if (idx + 1 >= questions.length) finish();
      else {
        setIdx((i) => i + 1);
        setPicked(null);
      }
    }, 450);
  }

  async function finish() {
    if (tick.current) clearInterval(tick.current);
    setPhase("done");
    // log the round
    await fetch("/api/brain-gym/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: category === "mixed" ? "attention" : category, // log a real category
        duration_sec: ROUND_SECONDS - remaining,
        completed: true,
        correct: score > questions.length / 2,
      }),
    }).catch(() => {});
    loadCounts();
    toast(`Speed round: ${score}/${questions.length}`, "good");
  }

  const totalTrained = Object.values(counts).reduce((a, b) => a + b, 0);
  const trainedCats = Object.values(counts).filter((c) => c > 0).length;

  // ---------- PLAYING ----------
  if (phase === "playing" && questions[idx]) {
    const q = questions[idx];
    return (
      <div className="space-y-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <span className="chip flex items-center gap-1">
            <Zap size={13} /> {CATS.find((c) => c.key === category)?.label}
          </span>
          <span
            className="flex items-center gap-1 text-lg font-bold tabular-nums"
            style={{ color: remaining <= 10 ? "var(--bad)" : "var(--ink)" }}
          >
            <Timer size={16} /> {remaining}s
          </span>
        </div>

        {/* progress */}
        <div className="flex items-center gap-2">
          <div className="bar flex-1">
            <span style={{ width: `${((idx + 1) / questions.length) * 100}%`, background: "linear-gradient(90deg,#c9a86a,#a97f45)" }} />
          </div>
          <span className="text-xs font-medium tabular-nums" style={{ color: "var(--muted)" }}>
            {idx + 1}/{questions.length} · {score}✓
          </span>
        </div>

        <div className="card">
          <p className="mb-3 text-[15px] font-semibold leading-snug">{q.q}</p>
          <div className="grid grid-cols-1 gap-2">
            {q.options.map((opt, oi) => {
              const isPick = picked === oi;
              const isCorrect = oi === q.correct;
              let style: React.CSSProperties = { borderColor: "rgba(0,0,0,0.1)" };
              if (picked !== null) {
                if (isCorrect) style = { borderColor: "var(--good)", background: "var(--good-soft)" };
                else if (isPick) style = { borderColor: "var(--bad)", background: "var(--bad-soft)" };
              }
              return (
                <button
                  key={oi}
                  disabled={picked !== null}
                  onClick={() => answer(oi)}
                  className="rounded-xl border px-3 py-2.5 text-left text-sm transition-all active:scale-[.98]"
                  style={style}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---------- DONE ----------
  if (phase === "done") {
    const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
    return (
      <div className="space-y-4 animate-fade-up">
        <section className="card text-center">
          <span className="icon-tile mx-auto mb-3 h-12 w-12">
            <Zap size={22} />
          </span>
          <p className="text-3xl font-bold" style={{ color: "var(--accent)" }}>
            {score}/{questions.length}
          </p>
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            {pct}% · {ROUND_SECONDS - remaining}s
          </p>
          <button onClick={() => start(category)} className="btn-primary">
            Play again
          </button>
          <button onClick={() => setPhase("idle")} className="btn-ghost ml-2 text-sm">
            Change category
          </button>
        </section>
      </div>
    );
  }

  // ---------- IDLE (category picker) ----------
  return (
    <div className="space-y-4 animate-fade-up">
      <section className="card">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="icon-tile h-9 w-9">
            <Brain size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold leading-tight">Speed Practice</h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Rapid MCQs against the clock · {trainedCats}/7 areas · {totalTrained} rounds
            </p>
          </div>
        </div>
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Pick an area and race the {ROUND_SECONDS}s timer. Answer fast, answer right.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CATS.map((c) => (
            <button
              key={c.key}
              onClick={() => start(c.key)}
              disabled={phase === "loading"}
              className="card-tap flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm disabled:opacity-50"
              style={{
                borderColor: c.key === "mixed" ? "var(--accent)" : "rgba(0,0,0,0.08)",
                background: c.key === "mixed" ? "var(--accent-soft)" : "transparent",
              }}
            >
              <span style={{ color: "var(--ink)" }}>{c.label}</span>
              {c.key !== "mixed" && (
                <span className="text-xs font-semibold" style={{ color: (counts[c.key] || 0) > 0 ? "var(--accent)" : "var(--muted)" }}>
                  {(counts[c.key] || 0) > 0 ? `${counts[c.key]}×` : "new"}
                </span>
              )}
            </button>
          ))}
        </div>
        {phase === "loading" && (
          <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--accent)" }}>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-soft)", borderTopColor: "var(--accent)" }} />
            Building your round…
          </p>
        )}
        {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
      </section>
    </div>
  );
}
