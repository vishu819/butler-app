"use client";

import { useEffect, useState } from "react";
import {
  Home,
  Dumbbell,
  BarChart3,
  MessageCircle,
  LayoutGrid,
  Newspaper,
  FileText,
  Building2,
  Library as LibraryIcon,
  User,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import Goals from "./Goals";
import Session from "./Session";
import Coach, { GREETING, type Msg } from "./Coach";
import Profile from "./Profile";
import BrainGym from "./BrainGym";
import Library from "./Library";
import News from "./News";
import Feed from "./Feed";
import AccountPanel from "./AccountPanel";
import StatHeader from "./StatHeader";
import AvatarMenu from "./AvatarMenu";
import { cachedGet, prefetch } from "@/lib/fetch-cache";

type Tab = "home" | "practice" | "progress" | "coach" | "others";
type OthersPage = "news" | "papers" | "articles" | "library" | "account";
type Stats = { progress: number; rating: number; streak: number };

const OTHERS_MENU: { key: OthersPage; label: string; sub: string; Icon: typeof Home }[] = [
  { key: "news", label: "AI News", sub: "Fresh headlines for engineers", Icon: Newspaper },
  { key: "papers", label: "Must-read Papers", sub: "Canonical architecture reads", Icon: FileText },
  { key: "articles", label: "Company Articles", sub: "Lessons from top eng teams", Icon: Building2 },
  { key: "library", label: "Library", sub: "Saved links, topics, diagrams", Icon: LibraryIcon },
  { key: "account", label: "Account", sub: "Password, reset, start fresh", Icon: User },
];

const TABS: { key: Tab; label: string; Icon: typeof Home }[] = [
  { key: "home", label: "Home", Icon: Home },
  { key: "practice", label: "Practice", Icon: Dumbbell },
  { key: "progress", label: "Progress", Icon: BarChart3 },
  { key: "coach", label: "Coach", Icon: MessageCircle },
  { key: "others", label: "Others", Icon: LayoutGrid },
];

export default function Dashboard({ name, email }: { name: string; email: string }) {
  const [tab, setTab] = useState<Tab>("home");
  const [othersPage, setOthersPage] = useState<OthersPage | null>(null);
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
      {/* Header — light pill, floats like the cards, recedes on every tab */}
      <header
        className="mb-5 flex items-center justify-between rounded-full border py-2 pl-2 pr-2.5"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line)",
          boxShadow: "0 1px 2px rgba(22,22,26,0.04), 0 10px 24px -16px rgba(22,22,26,0.14)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Brand mark — lime top hat on charcoal tile */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/butler-logo.svg"
            alt="Butler"
            className="h-10 w-10 shrink-0 rounded-full"
          />
          <div className="leading-tight">
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              {greeting}
            </p>
            <h1 className="text-base font-semibold">{name}</h1>
          </div>
        </div>
        {/* Account menu (logout, password, reset, start fresh) */}
        <AvatarMenu name={name} />
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
          </div>
        )}
        {tab === "practice" && <BrainGym />}
        {tab === "progress" && <Profile />}
        {tab === "others" && (
          othersPage === null ? (
            /* Menu of options — each opens its own page */
            <div className="stagger space-y-2.5">
              {OTHERS_MENU.map(({ key, label, sub, Icon }) => (
                <button
                  key={key}
                  onClick={() => setOthersPage(key)}
                  className="card lift flex w-full items-center gap-3 text-left"
                >
                  <span className="icon-tile h-10 w-10 shrink-0">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-tight">{label}</span>
                    <span className="block text-xs" style={{ color: "var(--muted)" }}>
                      {sub}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-gray-300" />
                </button>
              ))}
            </div>
          ) : (
            /* Sub-page with a back button */
            <div className="space-y-4">
              <button
                onClick={() => setOthersPage(null)}
                className="flex items-center gap-1 text-sm font-medium"
                style={{ color: "var(--muted)" }}
              >
                <ChevronLeft size={16} />
                {OTHERS_MENU.find((m) => m.key === othersPage)?.label}
              </button>
              <div key={othersPage}>
                {othersPage === "news" && <News />}
                {othersPage === "papers" && (
                  <Feed endpoint="/api/papers" kind="paper" emptyText="No papers loaded yet. Tap refresh to curate the must-reads." />
                )}
                {othersPage === "articles" && (
                  <Feed endpoint="/api/articles" kind="article" emptyText="No articles yet. Tap refresh to pull recent company eng posts." />
                )}
                {othersPage === "library" && <Library />}
                {othersPage === "account" && <AccountPanel name={name} email={email} />}
              </div>
            </div>
          )
        )}
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

      {/* Bottom nav — floating charcoal pill bar with lime active state */}
      <nav className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[env(safe-area-inset-bottom)]">
        <div
          className="mx-auto mb-3 flex max-w-md items-center justify-around rounded-full px-2 py-2"
          style={{
            background: "var(--charcoal)",
            boxShadow: "0 12px 34px -10px rgba(17,17,18,0.5)",
          }}
        >
          {TABS.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-label={label}
                className="flex flex-1 flex-col items-center gap-1 rounded-full py-1 transition-all active:scale-90"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-all"
                  style={
                    active
                      ? { background: "var(--accent-bright)", color: "var(--accent-ink)" }
                      : { color: "var(--on-charcoal-muted)" }
                  }
                >
                  <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: active ? "var(--accent-bright)" : "var(--on-charcoal-muted)" }}
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
