"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Timer } from "lucide-react";

type Exercise = {
  category: string;
  kind: string;
  prompt: string;
  answer: string;
  why: string;
  seconds: number;
};

const CAT_LABEL: Record<string, string> = {
  memory: "Memory",
  logic: "Logic",
  spatial: "Spatial Reasoning",
  pattern: "Pattern Recognition",
  mental_math: "Mental Math",
  verbal: "Verbal",
  attention: "Attention",
};

export default function BrainGym() {
  const [ex, setEx] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Timer
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startedAt = useRef<number>(0);
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

  async function start(category?: string) {
    setLoading(true);
    setErr(null);
    setRevealed(false);
    try {
      const res = await fetch("/api/brain-gym", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(category ? { category } : {}),
      });
      const text = await res.text();
      const j = text ? JSON.parse(text) : {};
      if (res.ok && j.exercise) {
        setEx(j.exercise);
        beginTimer(j.exercise.seconds || 120);
      } else setErr(j.error || `Couldn't load exercise (${res.status}).`);
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function beginTimer(seconds: number) {
    if (tick.current) clearInterval(tick.current);
    setRemaining(seconds);
    setRunning(true);
    startedAt.current = seconds;
    tick.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (tick.current) clearInterval(tick.current);
          setRunning(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  async function finish(gotIt: boolean | null) {
    if (tick.current) clearInterval(tick.current);
    setRunning(false);
    setRevealed(true);
    if (ex) {
      const used = startedAt.current - remaining;
      await fetch("/api/brain-gym/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: ex.category,
          duration_sec: used,
          completed: true,
          correct: gotIt,
        }),
      }).catch(() => {});
      loadCounts();
    }
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const totalTrained = Object.values(counts).reduce((a, b) => a + b, 0);
  const trainedCats = Object.values(counts).filter((c) => c > 0).length;

  return (
    <div className="space-y-4 animate-fade-up">
      <section className="card">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="icon-tile h-9 w-9">
            <Brain size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold leading-tight">Brain Gym</h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {trainedCats}/7 areas · {totalTrained} sessions
            </p>
          </div>
        </div>

        {!ex ? (
          <div className="py-2 text-center">
            <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
              Timed mental workouts that rotate through every cognitive area.
            </p>
            <button onClick={() => start()} disabled={loading} className="btn-primary">
              {loading ? "Loading…" : "Start next workout"}
            </button>
            {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="chip">{CAT_LABEL[ex.category] || ex.category}</span>
              <span
                className="flex items-center gap-1 text-lg font-bold tabular-nums"
                style={{ color: running && remaining <= 10 ? "var(--bad)" : "var(--ink)" }}
              >
                <Timer size={16} />
                {mmss(remaining)}
              </span>
            </div>

            <p className="whitespace-pre-wrap text-[15px] font-medium leading-snug">{ex.prompt}</p>

            {!revealed ? (
              <div className="flex gap-2">
                <button onClick={() => finish(true)} className="btn-primary flex-1">
                  I solved it
                </button>
                <button onClick={() => finish(false)} className="btn-ghost flex-1">
                  Reveal answer
                </button>
              </div>
            ) : (
              <div className="rounded-xl p-3 text-sm" style={{ background: "var(--accent-soft)" }}>
                <p style={{ color: "var(--ink)" }}>
                  <span className="font-semibold">Answer: </span>
                  {ex.answer}
                </p>
                {ex.why && <p className="mt-1" style={{ color: "var(--muted)" }}>{ex.why}</p>}
                <button onClick={() => start()} className="btn-primary mt-3">
                  Next workout →
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Coverage grid — which areas trained */}
      <section className="card">
        <p className="section-label mb-2">Coverage — train every area</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.keys(CAT_LABEL).map((k) => {
            const done = (counts[k] || 0) > 0;
            return (
            <button
              key={k}
              onClick={() => start(k)}
              disabled={loading}
              className="card-tap flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm"
              style={{
                borderColor: done ? "var(--accent)" : "rgba(0,0,0,0.08)",
                background: done ? "var(--accent-soft)" : "transparent",
              }}
            >
              <span className="min-w-0 truncate" style={{ color: "var(--ink)" }}>{CAT_LABEL[k]}</span>
              <span
                className="shrink-0 text-xs font-semibold"
                style={{ color: done ? "var(--accent)" : "var(--muted)" }}
              >
                {done ? `${counts[k]}×` : "new"}
              </span>
            </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
