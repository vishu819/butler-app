"use client";

import { useEffect, useState } from "react";

type Goal = { id: string; title: string; cadence: string; done_today: boolean };

const SUGGESTIONS = [
  { title: "Answer today's engineering question", cadence: "daily" },
  { title: "20 min deep reading (paper / architecture doc)", cadence: "daily" },
  { title: "One brain-gym set", cadence: "daily" },
  { title: "2-min reflection with the coach", cadence: "daily" },
  { title: "Sketch one system design from scratch", cadence: "weekly" },
];

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState("daily");

  async function load() {
    const res = await fetch("/api/goals");
    const json = await res.json();
    setGoals(json.goals || []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function toggle(g: Goal) {
    setGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, done_today: !x.done_today } : x)));
    await fetch("/api/goals/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal_id: g.id, done: !g.done_today }),
    });
  }

  async function add(t: string, c: string) {
    if (!t.trim()) return;
    setTitle("");
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, cadence: c }),
    });
    load();
  }

  const doneCount = goals.filter((g) => g.done_today).length;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Today&apos;s Goals</h2>
        {goals.length > 0 && (
          <span className="text-sm text-gray-500">
            {doneCount}/{goals.length} done
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : goals.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">No goals yet. Tap a suggestion to start:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                onClick={() => add(s.title, s.cadence)}
                className="rounded-full border border-brand-300 bg-brand-50 px-3 py-1 text-xs text-brand-700 dark:border-brand-700 dark:bg-brand-700/20 dark:text-brand-300"
              >
                + {s.title}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {goals.map((g) => (
            <li key={g.id}>
              <button
                onClick={() => toggle(g)}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-left active:scale-[.99] dark:border-gray-800"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                    g.done_today
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  {g.done_today && "✓"}
                </span>
                <span className={g.done_today ? "text-gray-400 line-through" : ""}>{g.title}</span>
                <span className="ml-auto text-[10px] uppercase text-gray-400">{g.cadence}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(title, cadence);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a goal…"
          className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900"
        />
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          className="rounded-xl border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
          <option value="monthly">monthly</option>
        </select>
        <button className="rounded-xl bg-brand-500 px-4 text-sm font-medium text-white">Add</button>
      </form>
    </section>
  );
}
