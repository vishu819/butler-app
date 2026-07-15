"use client";

import { useEffect, useState } from "react";
import { Map, RotateCw } from "lucide-react";
import PathRoadmap from "./viz/PathRoadmap";

type Topic = {
  id: string;
  module: string;
  topic: string;
  skill: string | null;
  rationale: string | null;
  status: string;
  mastery: number;
};

export default function Plan() {
  const [plan, setPlan] = useState<Topic[]>([]);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/plan")
      .then((r) => r.json())
      .then((j) => {
        setPlan(j.plan || []);
        setNarrative(j.profile?.narrative || null);
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  // mode "refresh" (default) re-plans the upcoming tail from current progress —
  // keeps what you've mastered. mode "rebuild" starts the whole path over.
  async function generate(mode: "refresh" | "rebuild" = "refresh") {
    if (mode === "rebuild" && plan.length) {
      const ok = window.confirm(
        "Start over? This discards your current path and progress and designs a brand-new one from scratch. Your skill levels are kept."
      );
      if (!ok) return;
    }
    setGenerating(true);
    setErr(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const text = await res.text();
      const j = text ? JSON.parse(text) : {};
      if (res.ok) load();
      else setErr(j.error || `Couldn't update plan (${res.status}).`);
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  // Group topics by module, preserving order.
  const modules: { name: string; topics: Topic[] }[] = [];
  for (const t of plan) {
    let m = modules.find((x) => x.name === t.module);
    if (!m) {
      m = { name: t.module, topics: [] };
      modules.push(m);
    }
    m.topics.push(t);
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <span className="icon-tile h-9 w-9">
          <Map size={18} />
        </span>
        <div className="flex-1">
          <h2 className="font-semibold leading-tight">Your Learning Path</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            An adaptive plan toward architect mastery
          </p>
        </div>
        {plan.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => generate("refresh")}
              disabled={generating}
              className="btn-ghost flex items-center gap-1 !px-2.5 !py-1.5 text-xs"
              title="Re-plan the upcoming topics based on your current progress and skills. Keeps what you've mastered."
            >
              <RotateCw size={13} className={generating ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={() => generate("rebuild")}
              disabled={generating}
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
              style={{ color: "var(--muted)" }}
              title="Discard this path and design a brand-new one from scratch."
            >
              Start over
            </button>
          </div>
        )}
      </div>

      {narrative && (
        <div className="card" style={{ background: "var(--accent-soft)" }}>
          <p className="section-label mb-1">What Butler knows about you</p>
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            {narrative}
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-28 rounded-3xl" />
          <div className="skeleton h-28 rounded-3xl" />
        </div>
      ) : plan.length === 0 ? (
        <div className="card text-center">
          <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
            No plan yet. Butler will design a personalized curriculum based on your skill
            assessment and how you learn.
          </p>
          <button onClick={() => generate("rebuild")} disabled={generating} className="btn-primary">
            {generating ? "Designing your plan…" : "Build my learning path"}
          </button>
          {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        </div>
      ) : (
        <div className="stagger space-y-4">
          {modules.map((m, mi) => (
            <section key={mi} className="card">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {mi + 1}
                </span>
                <h3 className="text-sm font-semibold">{m.name}</h3>
              </div>
              <PathRoadmap topics={m.topics} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
