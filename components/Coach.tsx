"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function Coach() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hey — I'm PI, your coach. I remember our conversations and your goals. What's on your mind today? We can plan, reflect, or dig into an architecture problem.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: json.reply || json.error || "…" },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Network error — try again." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex min-h-[70dvh] flex-col">
      <div className="flex-1 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-brand-500 text-white"
                  : "border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={send}
        className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-2xl bg-gray-50 px-4 py-2 dark:bg-gray-950"
      >
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Talk to your coach…"
            className="flex-1 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            disabled={sending}
            className="rounded-2xl bg-brand-500 px-5 font-medium text-white disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
