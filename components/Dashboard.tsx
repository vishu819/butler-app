"use client";

import { useState } from "react";
import Goals from "./Goals";
import DailyCards from "./DailyCards";
import Coach from "./Coach";
import ChangePassword from "./ChangePassword";

type Tab = "today" | "coach";

export default function Dashboard({ name }: { name: string }) {
  const [tab, setTab] = useState<Tab>("today");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{greeting},</p>
          <h1 className="text-2xl font-bold">{name} 🌱</h1>
        </div>
        <div className="flex items-center gap-1">
          <ChangePassword />
          <form action="/auth/signout" method="post">
            <button className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {tab === "today" ? (
        <div className="space-y-6">
          <Goals />
          <DailyCards />
        </div>
      ) : (
        <Coach />
      )}

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
        <div className="mx-auto flex max-w-2xl">
          <TabBtn label="Today" icon="📅" active={tab === "today"} onClick={() => setTab("today")} />
          <TabBtn label="Coach" icon="💬" active={tab === "coach"} onClick={() => setTab("coach")} />
        </div>
      </nav>
    </main>
  );
}

function TabBtn({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs ${
        active ? "text-brand-600 dark:text-brand-400" : "text-gray-400"
      }`}
    >
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );
}
