"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Target, X } from "lucide-react";
import { toast } from "./ui/Toast";

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

  async function remove(id: string) {
    setGoals((gs) => gs.filter((x) => x.id !== id));
    toast("Goal removed");
    await fetch("/api/goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => load());
  }

  const doneCount = goals.filter((g) => g.done_today).length;

  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="icon-tile h-9 w-9">
          <Target size={18} />
        </span>
        <h2 className="font-semibold">Today&apos;s Goals</h2>
        {goals.length > 0 && (
          <span className="ml-auto text-sm" style={{ color: "var(--muted)" }}>
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
                className="chip flex items-center gap-1 transition-transform active:scale-95"
              >
                <Plus size={12} /> {s.title}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {goals.map((g) => (
            <li key={g.id}>
              <div
                className="flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left"
                style={{ borderColor: "rgba(0,0,0,0.06)" }}
              >
                <button
                  onClick={() => toggle(g)}
                  className="flex flex-1 items-center gap-3 text-left transition-transform active:scale-[.99]"
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border transition-all"
                    style={
                      g.done_today
                        ? { background: "linear-gradient(135deg,#c9a86a,#a97f45)", borderColor: "transparent", color: "#fff" }
                        : { borderColor: "rgba(0,0,0,0.2)" }
                    }
                  >
                    {g.done_today && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className={g.done_today ? "text-gray-400 line-through" : ""}>{g.title}</span>
                </button>
                <span className="text-[10px] uppercase text-gray-400">{g.cadence}</span>
                <button
                  onClick={() => remove(g.id)}
                  aria-label="Delete goal"
                  className="shrink-0 rounded-lg p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <X size={15} />
                </button>
              </div>
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
        <button className="btn-primary px-4">Add</button>
      </form>
    </section>
  );
}
