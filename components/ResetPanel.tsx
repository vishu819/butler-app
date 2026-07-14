"use client";

import { useState } from "react";
import { invalidateAll } from "@/lib/fetch-cache";

const TARGETS: { key: string; label: string; desc: string }[] = [
  { key: "skills", label: "Skill progress", desc: "Skill levels, proficiency + quiz history" },
  { key: "brain_gym", label: "Brain gym history", desc: "All logged workouts" },
  { key: "chat", label: "Coach chat", desc: "Conversation history" },
  { key: "memory", label: "Coach memory", desc: "What Butler remembers about you" },
  { key: "goals", label: "Goals", desc: "Goals + check-off history" },
  { key: "library", label: "Library", desc: "Saved articles + recap diagrams" },
  { key: "everything", label: "Everything", desc: "Full reset — start the journey over" },
];

export default function ResetPanel({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function doReset(target: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, confirm: "RESET" }),
      });
      const j = await res.json();
      if (res.ok) {
        setMsg("✓ Reset done.");
        setPending(null);
        setConfirmText("");
        invalidateAll(); // clear any cached reads so nothing stale re-appears
        onReset();
      } else setMsg(j.error || "Reset failed");
    } catch {
      setMsg("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card border-red-200 dark:border-red-900/50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-semibold text-red-600 dark:text-red-400"
      >
        <span>⚠︎ Reset progress</span>
        <span className="text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">
            This is a daily-learning journey — reset only what you want to start fresh. Each
            reset asks you to type <b>RESET</b> to confirm. This cannot be undone.
          </p>
          {TARGETS.map((t) => (
            <div key={t.key} className="rounded-lg border border-gray-200 p-2.5 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-gray-400">{t.desc}</p>
                </div>
                {pending !== t.key && (
                  <button
                    onClick={() => {
                      setPending(t.key);
                      setConfirmText("");
                      setMsg(null);
                    }}
                    className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-600 dark:border-red-800 dark:text-red-400"
                  >
                    Reset
                  </button>
                )}
              </div>
              {pending === t.key && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    autoFocus
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type RESET"
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-red-500 dark:border-gray-700 dark:bg-gray-950"
                  />
                  <button
                    disabled={confirmText !== "RESET" || busy}
                    onClick={() => doReset(t.key)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "…" : "Confirm"}
                  </button>
                  <button
                    onClick={() => setPending(null)}
                    className="text-xs text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
          {msg && <p className="text-xs text-gray-500">{msg}</p>}
        </div>
      )}
    </section>
  );
}
