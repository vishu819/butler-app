"use client";

import { useEffect, useRef } from "react";

export type Msg = { role: "user" | "assistant"; content: string };

export const GREETING: Msg = {
  role: "assistant",
  content:
    "Hey — I'm Butler, your engineering mentor. I remember our conversations, your goals, and your skill profile. What's on your mind today? We can plan, reflect, or dig into an architecture problem.",
};

export default function Coach({
  messages,
  setMessages,
  sending,
  setSending,
}: {
  messages: Msg[];
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
  sending: boolean;
  setSending: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = (inputRef.current?.value || "").trim();
    if (!text || sending) return;
    if (inputRef.current) inputRef.current.value = "";
    // Add the user message + an empty assistant message we'll stream into.
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        // Update the last (assistant) message with what we have so far.
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
      if (!acc) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: "Something went wrong — try again." };
          return copy;
        });
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "Network error — try again." };
        return copy;
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex min-h-[70dvh] flex-col">
      <div className="flex-1 space-y-3">
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const streamingEmpty = isLast && m.role === "assistant" && m.content === "" && sending;
          return (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-brand-500 text-white"
                    : "border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                }`}
              >
                {streamingEmpty ? <span className="text-gray-400">thinking…</span> : m.content}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={send}
        className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-2xl bg-gray-50 px-4 py-2 dark:bg-gray-950"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
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
