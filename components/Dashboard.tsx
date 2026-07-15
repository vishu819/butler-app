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
import { Spinner } from "./ui/Spinner";
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
import { cachedGet, prefetch, invalidate } from "@/lib/fetch-cache";

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
  // Long-running Session work (generate / analyze). Session stays mounted so
  // this survives tab switches; a banner shows it from anywhere.
  const [sessionBusy, setSessionBusy] = useState<null | "generating" | "processing">(null);
  // First-run curriculum build runs in the background (onboarding no longer
  // waits for it), surfaced by a banner until the plan is ready.
  const [planBuilding, setPlanBuilding] = useState(false);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    // CRITICAL for the Home paint: the header stats + today's session.
    cachedGet("/api/profile")
      .then((j) => j.stats && setStats(j.stats))
      .catch(() => {});
    prefetch("/api/session");
    prefetch("/api/goals");

    // Non-critical: run after first paint so they don't compete with the above.
    const t = setTimeout(() => {
      // First-run setup: ensure a baseline profile + build the plan if missing.
      fetch("/api/init", { method: "POST" })
        .then((r) => r.json())
        .then((j) => {
          if (!j.needsPlan) {
            prefetch("/api/plan");
            return;
          }
          // Build the curriculum in the BACKGROUND (onboarding entered the app
          // immediately). Show a banner until it lands, then refresh caches.
          setPlanBuilding(true);
          fetch("/api/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "rebuild" }),
          })
            .catch(() => {})
            .finally(() => {
              setPlanBuilding(false);
              invalidate("/api/plan");
              invalidate("/api/session");
              invalidate("/api/profile");
              prefetch("/api/plan");
            });
        })
        .catch(() => {});
      prefetch("/api/learning");
    }, 400);
    return () => clearTimeout(t);
  }, []);

  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [sending, setSending] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  // Coach history loads only when the Coach tab is first opened — not on every
  // page load (it was fetching on mount even if you never open Coach).
  useEffect(() => {
    if (tab !== "coach" || chatLoaded) return;
    setChatLoaded(true);
    fetch("/api/chat")
      .then((r) => r.json())
      .then((j) => {
        const hist = (j.messages || []) as Msg[];
        if (hist.length) setMessages([GREETING, ...hist]);
      })
      .catch(() => {});
  }, [tab, chatLoaded]);

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

      {/* First-run: curriculum is building in the background (shown on every
          tab until ready). No action needed — it just informs. */}
      {planBuilding && (
        <div className="card-lime mb-3 flex w-full items-center gap-3 animate-fade-up">
          <Spinner size={18} />
          <span className="flex-1">
            <span className="block text-sm font-semibold leading-tight">
              Designing your learning path…
            </span>
            <span className="block text-xs" style={{ color: "var(--accent-soft-ink)" }}>
              One-time setup · you can start exploring while it finishes
            </span>
          </span>
        </div>
      )}

      {/* Global session-work banner — visible on any tab while a session is
          being generated or analyzed (the work keeps running in the background
          because <Session /> stays mounted). Tap to jump back Home. */}
      {sessionBusy && tab !== "home" && (
        <button
          onClick={() => setTab("home")}
          className="card-lime mb-3 flex w-full items-center gap-3 text-left animate-fade-up"
        >
          <Spinner size={18} />
          <span className="flex-1">
            <span className="block text-sm font-semibold leading-tight">
              {sessionBusy === "generating" ? "Building today's session…" : "Analyzing your session…"}
            </span>
            <span className="block text-xs" style={{ color: "var(--accent-soft-ink)" }}>
              Running in the background · tap to view
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0" />
        </button>
      )}

      {/* Home stays mounted so an in-flight session (generate/analyze) survives
          switching to other tabs. Hidden — not unmounted — when off Home. */}
      <div className={tab === "home" ? "stagger space-y-4 animate-fade-up" : "hidden"}>
        {stats && (
          <StatHeader progress={stats.progress} rating={stats.rating} streak={stats.streak} />
        )}
        <Session onBusyChange={setSessionBusy} />
        <Goals />
      </div>

      {/* Other tabs — keyed so they re-animate on switch */}
      <div key={tab}>
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
