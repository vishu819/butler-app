"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "magic";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const supabase = createClient();

    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setMsg({ kind: "ok", text: `Magic link sent to ${email}. Check your inbox.` });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is disabled, a session is created immediately.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.push("/");
          router.refresh();
        } else {
          setMsg({
            kind: "ok",
            text: "Account created. If email confirmation is on, check your inbox — otherwise switch to Sign in.",
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setMsg({ kind: "err", text: err.message || "Something went wrong" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center animate-pop">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/butler-logo.svg"
          alt="Butler"
          className="mx-auto mb-4 h-20 w-20 rounded-3xl"
          style={{ boxShadow: "0 16px 40px -14px rgba(17,17,18,.5)" }}
        />
        <h1 className="text-3xl font-bold tracking-tight">Butler</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Your engineering mentor
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3 animate-fade-up">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border bg-white/80 px-4 py-3 outline-none transition-colors focus:border-brand-500 dark:bg-gray-900/80"
          style={{ borderColor: "rgba(0,0,0,0.1)" }}
        />

        {mode !== "magic" && (
          <input
            type="password"
            required
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            className="w-full rounded-2xl border bg-white/80 px-4 py-3 outline-none transition-colors focus:border-brand-500 dark:bg-gray-900/80"
            style={{ borderColor: "rgba(0,0,0,0.1)" }}
          />
        )}

        <button disabled={loading} className="btn-primary w-full py-3 disabled:opacity-60">
          {loading
            ? "…"
            : mode === "signup"
            ? "Create account"
            : mode === "magic"
            ? "Send magic link"
            : "Sign in"}
        </button>

        {msg && (
          <p className={`text-sm ${msg.kind === "err" ? "text-red-500" : "text-brand-600"}`}>
            {msg.text}
          </p>
        )}
      </form>

      <div className="mt-5 space-y-2 text-center text-sm text-gray-500">
        {mode === "signin" && (
          <p>
            No account?{" "}
            <button onClick={() => { setMode("signup"); setMsg(null); }} className="font-medium text-brand-600">
              Create one
            </button>
          </p>
        )}
        {mode === "signup" && (
          <p>
            Already have one?{" "}
            <button onClick={() => { setMode("signin"); setMsg(null); }} className="font-medium text-brand-600">
              Sign in
            </button>
          </p>
        )}
        <p>
          <button
            onClick={() => { setMode(mode === "magic" ? "signin" : "magic"); setMsg(null); }}
            className="text-gray-400 underline"
          >
            {mode === "magic" ? "Use password instead" : "Or email me a magic link"}
          </button>
        </p>
      </div>
    </main>
  );
}
