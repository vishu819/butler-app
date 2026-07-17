"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Send, MessageCircleQuestion, Sparkles, ChevronDown } from "lucide-react";
import { Markdown } from "./ui/Markdown";

type QA = { id?: string; selection?: string | null; question: string; answer: string };

// The daily deep-dive article, expandable, with inline "ask more" — a free-form
// follow-up box AND highlight-to-ask (select text → "Ask about this"). Answers
// stream in and are saved per day (article_questions), so the thread reloads.
export default function DeepArticle({
  learnDate,
  html,
}: {
  learnDate: string;
  html: string;
}) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<QA[]>([]);
  const [loadedThread, setLoadedThread] = useState(false);
  const [q, setQ] = useState("");
  const [selection, setSelection] = useState("");
  const [asking, setAsking] = useState(false);
  const [streaming, setStreaming] = useState<QA | null>(null);
  const [askBtn, setAskBtn] = useState<{ x: number; y: number; text: string } | null>(null);
  const [threadOpen, setThreadOpen] = useState(true); // collapse the Q&A thread

  const articleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load the saved Q&A thread the first time the article is opened.
  useEffect(() => {
    if (!open || loadedThread) return;
    setLoadedThread(true);
    fetch(`/api/learn/ask?learn_date=${encodeURIComponent(learnDate)}`)
      .then((r) => r.json())
      .then((j) => setThread(j.questions || []))
      .catch(() => {});
  }, [open, loadedThread, learnDate]);

  // Show a floating "Ask about this" when the user selects text inside the article.
  function onMouseUp() {
    const selApi = window.getSelection();
    const text = selApi?.toString().trim() || "";
    if (!text || text.length < 3 || !articleRef.current) {
      setAskBtn(null);
      return;
    }
    // Only if the selection is within THIS article.
    const anchor = selApi?.anchorNode;
    if (anchor && !articleRef.current.contains(anchor)) {
      setAskBtn(null);
      return;
    }
    const range = selApi?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    const box = articleRef.current.getBoundingClientRect();
    if (!rect) return;
    setAskBtn({
      x: rect.left - box.left + rect.width / 2,
      y: rect.top - box.top - 8,
      text,
    });
  }

  function askAboutSelection() {
    if (!askBtn) return;
    setSelection(askBtn.text);
    setAskBtn(null);
    // Focus the box so they can type their question about the passage.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function ask() {
    const question = q.trim();
    if (!question || asking) return;
    setAsking(true);
    setThreadOpen(true); // reveal the thread so the streaming answer is visible
    setQ("");
    const pending: QA = { question, selection: selection || null, answer: "" };
    setStreaming(pending);
    const sel = selection;
    setSelection("");
    try {
      const res = await fetch("/api/learn/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learn_date: learnDate, question, selection: sel || undefined }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let answer = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += dec.decode(value, { stream: true });
        setStreaming({ ...pending, answer });
      }
      setThread((t) => [...t, { ...pending, answer }]);
    } catch {
      setThread((t) => [...t, { ...pending, answer: "Sorry — couldn't answer that. Please try again." }]);
    } finally {
      setStreaming(null);
      setAsking(false);
    }
  }

  return (
    <details
      className="mt-3 rounded-2xl border"
      style={{ borderColor: "var(--line)" }}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-semibold"
        style={{ color: "var(--accent)" }}
      >
        <BookOpen size={15} />
        <span className="flex-1">Read the deep dive</span>
        <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>
          the read you shouldn&apos;t miss
        </span>
      </summary>

      {/* Article body — selection anywhere here can be asked about */}
      <div className="relative px-3 pb-3 pt-1">
        <div
          ref={articleRef}
          className="deep-article"
          onMouseUp={onMouseUp}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {askBtn && (
          <button
            onClick={askAboutSelection}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-lg"
            style={{ left: askBtn.x, top: askBtn.y, background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            <MessageCircleQuestion size={13} /> Ask about this
          </button>
        )}
      </div>

      {/* Q&A thread */}
      <div className="border-t px-3 py-3" style={{ borderColor: "var(--line)" }}>
        {thread.length > 0 ? (
          <button
            onClick={() => setThreadOpen((v) => !v)}
            className="mb-2 flex w-full items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--muted)" }}
          >
            <Sparkles size={13} />
            <span className="flex-1 text-left">
              Ask Butler about this article
              <span className="ml-1 font-normal">· {thread.length} saved</span>
            </span>
            <ChevronDown
              size={15}
              className="transition-transform"
              style={{ transform: threadOpen ? "rotate(180deg)" : "none" }}
            />
          </button>
        ) : (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--muted)" }}>
            <Sparkles size={13} /> Ask Butler about this article
          </p>
        )}

        {threadOpen && (thread.length > 0 || streaming) && (
          <div className="mb-3 space-y-3">
            {thread.map((qa, i) => (
              <QaBubble key={qa.id || i} qa={qa} />
            ))}
            {streaming && <QaBubble qa={streaming} streaming />}
          </div>
        )}

        {selection && (
          <div
            className="mb-2 rounded-xl px-2.5 py-1.5 text-xs"
            style={{ background: "var(--accent-soft)", color: "var(--accent-soft-ink)" }}
          >
            Asking about: <em>“{selection.slice(0, 140)}{selection.length > 140 ? "…" : ""}”</em>
            <button onClick={() => setSelection("")} className="ml-2 underline">clear</button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="Ask a follow-up… (or select text above)"
            rows={1}
            className="min-w-0 flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--surface)" }}
          />
          <button
            type="submit"
            disabled={!q.trim() || asking}
            className="btn-primary flex shrink-0 items-center gap-1 !px-3 !py-2 text-sm disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </details>
  );
}

function QaBubble({ qa, streaming }: { qa: QA; streaming?: boolean }) {
  return (
    <div className="space-y-1.5">
      {qa.selection && (
        <p className="text-[11px] italic" style={{ color: "var(--muted)" }}>
          on: “{qa.selection.slice(0, 100)}{qa.selection.length > 100 ? "…" : ""}”
        </p>
      )}
      <div
        className="ml-auto w-fit max-w-[85%] rounded-2xl px-3 py-1.5 text-sm"
        style={{ background: "var(--accent-soft)", color: "var(--accent-soft-ink)" }}
      >
        {qa.question}
      </div>
      <div className="rounded-2xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
        {qa.answer ? (
          <Markdown text={qa.answer} />
        ) : streaming ? (
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Thinking…
          </span>
        ) : null}
      </div>
    </div>
  );
}
