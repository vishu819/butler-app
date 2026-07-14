"use client";

import { useEffect, useState } from "react";
import { Home, Dumbbell, BarChart3, BookOpen, MessageCircle } from "lucide-react";
import Goals from "./Goals";
import DailyCards from "./DailyCards";
import Session from "./Session";
import Coach, { GREETING, type Msg } from "./Coach";
import Profile from "./Profile";
import BrainGym from "./BrainGym";
import Library from "./Library";
import StatHeader from "./StatHeader";
import AccountPanel from "./AccountPanel";
import { cachedGet, prefetch } from "@/lib/fetch-cache";

type Tab = "home" | "practice" | "progress" | "library" | "coach";
type Stats = { progress: number; rating: number; streak: number };

const TABS: { key: Tab; label: string; Icon: typeof Home }[] = [
  { key: "home", label: "Home", Icon: Home },
  { key: "practice", label: "Practice", Icon: Dumbbell },
  { key: "progress", label: "Progress", Icon: BarChart3 },
  { key: "library", label: "Library", Icon: BookOpen },
  { key: "coach", label: "Coach", Icon: MessageCircle },
];

export default function Dashboard({ name, email }: { name: string; email: string }) {
  const [tab, setTab] = useState<Tab>("home");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    // First-run setup: ensure a baseline profile + build the plan if missing.
    fetch("/api/init", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (j.needsPlan) fetch("/api/plan", { method: "POST" }).catch(() => {});
      })
      .catch(() => {});

    cachedGet("/api/profile")
      .then((j) => j.stats && setStats(j.stats))
      .catch(() => {});
    // Prefetch the other tabs' data so switching is instant.
    prefetch("/api/session");
    prefetch("/api/plan");
    prefetch("/api/learning");
    prefetch("/api/goals");
  }, []);

  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((j) => {
        const hist = (j.messages || []) as Msg[];
        if (hist.length) setMessages([GREETING, ...hist]);
      })
      .catch(() => {});
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Brand mark */}
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
            style={{
              background: "linear-gradient(135deg,#c9a86a,#a97f45)",
              boxShadow: "0 6px 16px -8px rgba(169,127,69,.6)",
            }}
          >
            🎩
          </span>
          <div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {greeting}
            </p>
            <h1 className="text-xl font-bold leading-tight tracking-tight">{name}</h1>
          </div>
        </div>
        {/* Account → jumps to Progress tab where account/actions live */}
        <button
          onClick={() => setTab("progress")}
          aria-label="Account"
          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-transform active:scale-90"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {name.trim().charAt(0).toUpperCase() || "?"}
        </button>
      </header>

      {/* content — keyed so it re-animates on tab change */}
      <div key={tab}>
        {tab === "home" && (
          <div className="stagger space-y-4">
            {stats && (
              <StatHeader progress={stats.progress} rating={stats.rating} streak={stats.streak} />
            )}
            <Session />
            <Goals />
            <DailyCards />
          </div>
        )}
        {tab === "practice" && <BrainGym />}
        {tab === "progress" && (
        <div className="space-y-4">
          <Profile />
          <AccountPanel name={name} email={email} />
        </div>
      )}
        {tab === "library" && <Library />}
      </div>

      {/* Coach stays mounted to preserve conversation */}
      <div className={tab === "coach" ? "animate-fade-up" : "hidden"}>
        <Coach
          messages={messages}
          setMessages={setMessages}
          sending={sending}
          setSending={setSending}
        />
      </div>

      {/* Bottom nav — floating pill bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[env(safe-area-inset-bottom)]">
        <div
          className="mx-auto mb-3 flex max-w-md items-center justify-around rounded-3xl border px-2 py-1.5 backdrop-blur-xl"
          style={{
            background: "rgba(255,255,255,0.82)",
            borderColor: "rgba(0,0,0,0.06)",
            boxShadow: "0 10px 30px -12px rgba(31,36,48,0.25)",
          }}
        >
          {TABS.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-label={label}
                className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 transition-all active:scale-90"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl transition-all ${
                    active ? "scale-105" : ""
                  }`}
                  style={
                    active
                      ? { background: "linear-gradient(135deg,#c9a86a,#a97f45)", color: "#fff", boxShadow: "0 6px 14px -6px rgba(169,127,69,.6)" }
                      : { color: "var(--muted)" }
                  }
                >
                  <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: active ? "var(--accent)" : "var(--muted)" }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
