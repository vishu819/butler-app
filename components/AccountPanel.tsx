"use client";

import { useState } from "react";
import { User, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { invalidateAll } from "@/lib/fetch-cache";
import Onboarding from "./Onboarding";

// Account info + actions, including "Start fresh" (full reset + re-onboarding
// via the same wizard as first-run, minus the name step).
export default function AccountPanel({ name, email }: { name: string; email: string }) {
  const [stage, setStage] = useState<"idle" | "confirm" | "wizard">("idle");
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setPwMsg(error.message);
    else {
      setPwMsg("Password updated.");
      setPw("");
    }
  }

  // Start fresh re-onboarding: the wizard (mode="reset") wipes data, re-asks the
  // role/experience/goal questionnaire (no name), and rebuilds the plan.
  if (stage === "wizard") {
    return (
      <Onboarding
        initialName={name}
        email={email}
        mode="reset"
        onDone={() => invalidateAll()}
      />
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Account card */}
      <section className="card">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="icon-tile h-9 w-9">
            <User size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{name}</h2>
            <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
              {email}
            </p>
          </div>
        </div>

        <form onSubmit={changePassword} className="flex gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            minLength={6}
            placeholder="New password"
            className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:bg-gray-950"
            style={{ borderColor: "rgba(0,0,0,0.12)" }}
          />
          <button className="btn-ghost">Update</button>
        </form>
        {pwMsg && <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{pwMsg}</p>}

        <form action="/auth/signout" method="post" className="mt-2">
          <button className="btn-ghost w-full">Sign out</button>
        </form>
      </section>

      {/* Start fresh */}
      <section className="card border-red-200 dark:border-red-900/50">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--bad)" }}>
          <RefreshCw size={15} /> Start fresh
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Wipe all your learning history and rebuild your profile from scratch. Your account stays.
          This can&apos;t be undone.
        </p>

        {stage === "idle" && (
          <button onClick={() => setStage("confirm")} className="mt-3 btn-ghost text-sm" style={{ color: "var(--bad)" }}>
            Start fresh…
          </button>
        )}

        {stage === "confirm" && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setStage("wizard")}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Yes, wipe and rebuild
            </button>
            <button onClick={() => setStage("idle")} className="btn-ghost text-sm">
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
