"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) setMsg({ kind: "err", text: error.message });
    else {
      setMsg({ kind: "ok", text: "Password updated." });
      setPw("");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800"
      >
        🔑
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          <p className="mb-2 text-xs text-gray-500">Set a new password</p>
          <form onSubmit={save} className="space-y-2">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={6}
              required
              placeholder="New password"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-950"
            />
            <button
              disabled={saving}
              className="btn-primary w-full disabled:opacity-60"
            >
              {saving ? "Saving…" : "Update password"}
            </button>
            {msg && (
              <p className={`text-xs ${msg.kind === "err" ? "text-red-500" : "text-brand-600"}`}>
                {msg.text}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
