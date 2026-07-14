"use client";

import { useEffect, useState } from "react";

type Skill = {
  key: string;
  label: string;
  level: number;
  proficiency: number;
  seen: number;
  correct: number;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => {
        setSkills(j.skills || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Loading your skill profile…</p>;

  const tested = skills.filter((s) => s.seen > 0);
  const overall =
    tested.length > 0
      ? Math.round(tested.reduce((sum, s) => sum + s.proficiency, 0) / tested.length)
      : 0;
  const strong = [...tested].sort((a, b) => b.proficiency - a.proficiency).slice(0, 3);
  const weak = [...tested].sort((a, b) => a.proficiency - b.proficiency).slice(0, 3);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-1 font-semibold">Your Architect Profile</h2>
        {tested.length === 0 ? (
          <p className="text-sm text-gray-500">
            Take a few daily quizzes and Butler will build your skill profile here —
            tracking where you&apos;re strong, where you&apos;re weak, and ramping difficulty
            as you improve.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-brand-600 dark:text-brand-400">
                {overall}
              </span>
              <span className="text-sm text-gray-500">/100 overall · {tested.length}/{skills.length} skills assessed</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-green-600">Strengths</p>
                {strong.map((s) => (
                  <p key={s.key} className="text-gray-600 dark:text-gray-300">
                    {s.label} ({s.proficiency})
                  </p>
                ))}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-amber-600">Focus areas</p>
                {weak.map((s) => (
                  <p key={s.key} className="text-gray-600 dark:text-gray-300">
                    {s.label} ({s.proficiency})
                  </p>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
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
                  className={`h-full rounded-full ${
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
    </div>
  );
}
