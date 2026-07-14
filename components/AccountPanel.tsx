"use client";

import { useState } from "react";
import { User, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "./ui/Toast";
import { invalidateAll } from "@/lib/fetch-cache";

// Account info + actions, including "Start fresh" (full reset + re-onboarding).
export default function AccountPanel({ name, email }: { name: string; email: string }) {
  const [stage, setStage] = useState<"idle" | "confirm" | "intake" | "working">("idle");
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  // intake answers (all optional)
  const [experience, setExperience] = useState("");
  const [role, setRole] = useState("");
  const [goal, setGoal] = useState("");
  const [strong, setStrong] = useState("");
  const [weak, setWeak] = useState("");

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

  async function startFresh() {
    setStage("working");
    try {
      // 1) wipe all learning data (keep account)
      await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "everything", confirm: "RESET" }),
      });
      // 2) seed a starting profile from intake (optional answers)
      await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: { experience, role, goal, strong, weak } }),
      });
      // 3) build a fresh curriculum (this is the slow step, ~15-20s)
      await fetch("/api/plan", { method: "POST" });
      // 4) clear all client caches so nothing stale is re-served
      invalidateAll();
      // Reload only AFTER everything above has completed — no timer race.
      window.location.assign("/");
    } catch {
      toast("Couldn't start fresh — try again", "bad");
      setStage("idle");
    }
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
              onClick={() => setStage("intake")}
              className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Yes, wipe and rebuild
            </button>
            <button onClick={() => setStage("idle")} className="btn-ghost text-sm">
              Cancel
            </button>
          </div>
        )}

        {stage === "intake" && (
          <div className="mt-3 space-y-2">
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              A few optional questions to calibrate day one — skip any you like.
            </p>
            <Field label="Years of experience" value={experience} set={setExperience} placeholder="e.g. 6" />
            <Field label="Current role" value={role} set={setRole} placeholder="e.g. Senior backend engineer" />
            <Field label="Main goal" value={goal} set={setGoal} placeholder="e.g. become a staff architect" />
            <Field label="Feel strong in" value={strong} set={setStrong} placeholder="e.g. API design, caching" />
            <Field label="Want to improve" value={weak} set={setWeak} placeholder="e.g. distributed consensus" />
            <div className="flex gap-2 pt-1">
              <button onClick={startFresh} className="btn-primary flex-1 py-2">
                Build my fresh profile
              </button>
              <button onClick={startFresh} className="btn-ghost text-sm">
                Skip
              </button>
            </div>
          </div>
        )}

        {stage === "working" && (
          <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--accent)" }}>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-soft)", borderTopColor: "var(--accent)" }} />
            Wiping and rebuilding your profile… this takes ~20 seconds.
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  set,
  placeholder,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:bg-gray-950"
        style={{ borderColor: "rgba(0,0,0,0.12)" }}
      />
    </label>
  );
}
