"use client";

import { useEffect, useState } from "react";
import StatHeader from "./StatHeader";
import ResetPanel from "./ResetPanel";
import CountUp from "./ui/CountUp";
import Plan from "./Plan";
import SkillRadar from "./viz/SkillRadar";
import { SlidersHorizontal } from "lucide-react";
import { cachedGet } from "@/lib/fetch-cache";

type Skill = {
  key: string;
  label: string;
  level: number;
  proficiency: number;
  seen: number;
  correct: number;
};
type WeekDay = { date: string; active: boolean };
type Stats = {
  progress: number;
  rating: number;
  streak: number;
  assessed: number;
  total: number;
  totalQuestions: number;
  accuracy: number;
  gymSessions: number;
  week: WeekDay[];
};

const LEVEL_NAME: Record<number, string> = {
  1: "Foundational",
  2: "Applied",
  3: "Intermediate",
  4: "Advanced",
  5: "Expert",
};

export default function Profile() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  function load(force = false) {
    setLoading(true);
    cachedGet("/api/profile", { force })
      .then((j) => {
        setSkills(j.skills || []);
        setStats(j.stats || null);
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Loading your dashboard…</p>;

  const tested = skills.filter((s) => s.seen > 0);
  const strong = [...tested].sort((a, b) => b.proficiency - a.proficiency).slice(0, 3);
  const weak = [...tested].sort((a, b) => a.proficiency - b.proficiency).slice(0, 3);

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold">Progress</h2>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.05)", color: "var(--muted)" }}
        >
          <SlidersHorizontal size={15} />
        </span>
      </div>

      {stats && (
        <StatHeader progress={stats.progress} rating={stats.rating} streak={stats.streak} />
      )}

      {/* Metric tiles */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="metric">
            <div className="metric-value">
              <CountUp value={stats.totalQuestions} />
            </div>
            <div className="metric-label">Questions</div>
          </div>
          <div className="metric">
            <div className="metric-value" style={{ color: "var(--good)" }}>
              <CountUp value={stats.accuracy} suffix="%" />
            </div>
            <div className="metric-label">Accuracy</div>
          </div>
          <div className="metric">
            <div className="metric-value">
              <CountUp value={stats.gymSessions} />
            </div>
            <div className="metric-label">Workouts</div>
          </div>
        </div>
      )}

      {/* Weekly activity strip */}
      {stats && (
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <span className="section-label">This week</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {stats.week.filter((d) => d.active).length}/7 active
            </span>
          </div>
          <div className="flex items-end justify-between gap-1.5">
            {stats.week.map((d) => {
              const dow = new Date(d.date + "T00:00:00Z").toLocaleDateString(undefined, {
                weekday: "narrow",
              });
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-lg transition-all"
                    style={{
                      height: d.active ? 32 : 10,
                      background: d.active
                        ? "var(--accent-bright)"
                        : "rgba(0,0,0,0.08)",
                    }}
                  />
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                    {dow}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="mb-1 font-semibold">Your Architect Journey</h2>
        {tested.length === 0 ? (
          <p className="text-sm text-gray-500">
            Take a few daily quizzes and Butler will map where you&apos;re strong, where
            you&apos;re weak, and ramp difficulty as you improve.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-green-600">Strengths</p>
              {strong.map((s) => (
                <p key={s.key} className="text-gray-600 dark:text-gray-300">
                  {s.label} <span className="text-gray-400">({s.proficiency})</span>
                </p>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-amber-600">Focus areas</p>
              {weak.map((s) => (
                <p key={s.key} className="text-gray-600 dark:text-gray-300">
                  {s.label} <span className="text-gray-400">({s.proficiency})</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Skill map — dark card with lime/amber bars (matches the render) */}
      <section className="card-dark">
        <p className="mb-3 text-sm" style={{ color: "var(--on-charcoal-muted)" }}>
          Skill map
        </p>
        <div className="space-y-3">
          {skills.map((s) => {
            const color =
              s.seen === 0
                ? "var(--charcoal-line)"
                : s.proficiency >= 60
                ? "var(--accent-bright)"
                : s.proficiency >= 40
                ? "var(--warn)"
                : "var(--bad)";
            const pctColor = s.seen === 0 ? "var(--on-charcoal-muted)" : color;
            return (
              <div key={s.key}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "var(--on-charcoal)" }}>
                    {s.label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: pctColor }}>
                    {s.seen === 0 ? "—" : `${s.proficiency}%`}
                  </span>
                </div>
                <div className="bar-dark">
                  <span style={{ width: `${s.seen === 0 ? 4 : s.proficiency}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Radar view kept below for the full-shape picture */}
      {tested.length >= 3 && (
        <section className="card">
          <h3 className="mb-2 font-semibold">Shape</h3>
          <SkillRadar skills={skills.map((s) => ({ key: s.key, label: s.label, proficiency: s.proficiency }))} />
        </section>
      )}

      <Plan />

      <ResetPanel onReset={() => load(true)} />
    </div>
  );
}
