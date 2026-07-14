"use client";

import { Check, MapPin, Lock } from "lucide-react";

// A vertical journey roadmap of curriculum topics: a connecting spine with
// nodes that show mastered / active / upcoming status.
type Topic = { id: string; topic: string; module: string; status: string; mastery: number };

export default function PathRoadmap({ topics }: { topics: Topic[] }) {
  if (topics.length === 0) return null;
  return (
    <div className="relative pl-1">
      {topics.map((t, i) => {
        const done = t.status === "mastered";
        const active = t.status === "active";
        const isLast = i === topics.length - 1;
        return (
          <div key={t.id} className="relative flex gap-3 pb-4">
            {/* Spine */}
            {!isLast && (
              <div
                className="absolute left-[11px] top-6 h-full w-0.5"
                style={{ background: done ? "var(--good)" : "rgba(0,0,0,0.1)" }}
              />
            )}
            {/* Node */}
            <div
              className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              style={
                done
                  ? { background: "var(--good)", color: "#fff" }
                  : active
                  ? { background: "var(--accent)", color: "#fff", boxShadow: "0 0 0 4px var(--accent-soft)" }
                  : { background: "rgba(0,0,0,0.06)", color: "var(--muted)" }
              }
            >
              {done ? <Check size={13} strokeWidth={3} /> : active ? <MapPin size={12} /> : <Lock size={11} />}
            </div>
            {/* Label */}
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`text-sm leading-snug ${done ? "text-gray-400" : active ? "font-semibold" : ""}`}>
                {t.topic}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">{t.module}</p>
              {t.mastery > 0 && !done && (
                <div className="mt-1 flex items-center gap-1.5">
                  <div className="bar w-24">
                    <span style={{ width: `${t.mastery}%`, background: "var(--accent)" }} />
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                    {t.mastery}%
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
