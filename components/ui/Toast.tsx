"use client";

import { useEffect, useState } from "react";

// Dead-simple toast: call `toast("Saved")` anywhere; a listener renders it.
// Event-based, no context/provider overhead.
type ToastMsg = { id: number; text: string; kind: "info" | "good" | "bad" };
let counter = 0;
const listeners = new Set<(m: ToastMsg) => void>();

export function toast(text: string, kind: ToastMsg["kind"] = "info") {
  const m = { id: ++counter, text, kind };
  listeners.forEach((l) => l(m));
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    const add = (m: ToastMsg) => {
      setItems((xs) => [...xs, m]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== m.id)), 2600);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((m) => (
        <div
          key={m.id}
          className="animate-pop pointer-events-auto rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg"
          style={{
            background: "var(--surface)",
            border: "1px solid rgba(0,0,0,0.06)",
            color:
              m.kind === "good"
                ? "var(--good)"
                : m.kind === "bad"
                ? "var(--bad)"
                : "var(--ink)",
          }}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
