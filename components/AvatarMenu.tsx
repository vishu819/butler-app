"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, KeyRound, RotateCcw, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "./ui/Toast";
import { invalidateAll } from "@/lib/fetch-cache";

// Top-right avatar with a dropdown: change password, reset progress, start fresh, logout.
export default function AvatarMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "password" | "reset">("menu");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setView("menu");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setMsg(error.message);
    else {
      setMsg("Password updated.");
      setPw("");
    }
  }

  async function resetProgress() {
    setBusy(true);
    try {
      await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "everything", confirm: "RESET" }),
      });
      invalidateAll();
      toast("Progress reset", "good");
      window.location.assign("/");
    } catch {
      toast("Couldn't reset — try again", "bad");
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-transform active:scale-90"
        style={{ background: "var(--accent-bright)", color: "var(--accent-ink)" }}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </button>

      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-2xl border bg-white shadow-lg dark:bg-gray-900"
          style={{ borderColor: "rgba(0,0,0,0.08)" }}
        >
          {view === "menu" && (
            <div className="py-1">
              <MenuItem icon={KeyRound} label="Change password" onClick={() => { setView("password"); setMsg(null); }} />
              <MenuItem icon={RotateCcw} label="Reset progress" onClick={() => setView("reset")} />
              <MenuItem
                icon={Sparkles}
                label="Start fresh"
                onClick={() => setView("reset")}
              />
              <div className="my-1 border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }} />
              <form action="/auth/signout" method="post">
                <button className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <LogOut size={16} /> Log out
                </button>
              </form>
            </div>
          )}

          {view === "password" && (
            <form onSubmit={changePassword} className="space-y-2 p-3">
              <p className="section-label">New password</p>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                minLength={6}
                placeholder="At least 6 characters"
                className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:bg-gray-950"
                style={{ borderColor: "rgba(0,0,0,0.12)" }}
              />
              <div className="flex gap-2">
                <button className="btn-primary flex-1 py-2 text-sm">Update</button>
                <button type="button" onClick={() => setView("menu")} className="btn-ghost text-sm">
                  Back
                </button>
              </div>
              {msg && <p className="text-xs" style={{ color: "var(--muted)" }}>{msg}</p>}
            </form>
          )}

          {view === "reset" && (
            <div className="space-y-2 p-3">
              <p className="text-sm font-semibold" style={{ color: "var(--bad)" }}>
                Reset everything?
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Wipes all learning progress, sessions, profile, and plan. Your account
                stays. This can&apos;t be undone.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={resetProgress}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Resetting…" : "Yes, reset"}
                </button>
                <button onClick={() => setView("menu")} className="btn-ghost text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<any>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
      style={{ color: "var(--ink)" }}
    >
      <Icon size={16} style={{ color: "var(--muted)" }} /> {label}
    </button>
  );
}
