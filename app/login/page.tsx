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
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-3xl">
          🎩
        </div>
        <h1 className="text-2xl font-bold">Butler</h1>
        <p className="text-sm text-gray-500">Your personal growth companion</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900"
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
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900"
          />
        )}

        <button
          disabled={loading}
          className="w-full rounded-xl bg-brand-500 px-4 py-3 font-medium text-white active:scale-[.99] disabled:opacity-60"
        >
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
