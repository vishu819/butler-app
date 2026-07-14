"use client";

import { useEffect, useState } from "react";
import StatHeader from "./StatHeader";
import ResetPanel from "./ResetPanel";

type Skill = {
  key: string;
  label: string;
  level: number;
  proficiency: number;
  seen: number;
  correct: number;
};
type Stats = { progress: number; rating: number; streak: number; assessed: number; total: number };

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

  function load() {
    setLoading(true);
    fetch("/api/profile")
      .then((r) => r.json())
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
      {stats && (
        <StatHeader progress={stats.progress} rating={stats.rating} streak={stats.streak} />
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

      <section className="card">
        <h3 className="mb-3 font-semibold">Skill map</h3>
        <div className="space-y-3">
          {skills.map((s) => (
            <div key={s.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{s.label}</span>
                <span className="text-xs text-gray-400">
                  {s.seen === 0 ? "not assessed" : `Lv ${s.level} · ${LEVEL_NAME[s.level]}`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${
                    s.seen === 0
                      ? "bg-gray-300 dark:bg-gray-700"
                      : s.proficiency >= 70
                      ? "bg-green-500"
                      : s.proficiency >= 45
                      ? "bg-amber-500"
                      : "bg-red-400"
                  }`}
                  style={{ width: `${s.seen === 0 ? 4 : s.proficiency}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <ResetPanel onReset={load} />
    </div>
  );
}
