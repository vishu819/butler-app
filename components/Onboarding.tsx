"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { ROLES } from "@/lib/roles";

// Rotating reassurance while the LLM designs the curriculum (~15-20s total).
const BUILD_STEPS = [
  "Reading your goals & experience…",
  "Mapping the skills for your role…",
  "Choosing where to start you…",
  "Designing your modules & topics…",
  "Ordering your path, foundations first…",
  "Almost there — finishing touches…",
];

const EXPERIENCE = [
  { key: "student", label: "Student / just starting", sub: "< 1 year" },
  { key: "junior", label: "Early career", sub: "1–3 years" },
  { key: "mid", label: "Mid-level", sub: "3–6 years" },
  { key: "senior", label: "Senior", sub: "6–10 years" },
  { key: "staff", label: "Staff+ / lead", sub: "10+ years" },
];

type Step = "name" | "role" | "experience" | "goal" | "building";

export default function Onboarding({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState<string>("");
  const [experience, setExperience] = useState<string>("");
  const [goal, setGoal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [buildStep, setBuildStep] = useState(0);

  // Advance the reassurance messages while building (caps on the last one).
  useEffect(() => {
    if (step !== "building") return;
    const t = setInterval(() => {
      setBuildStep((s) => Math.min(s + 1, BUILD_STEPS.length - 1));
    }, 3200);
    return () => clearInterval(t);
  }, [step]);

  async function finish() {
    setStep("building");
    setErr(null);
    try {
      // Save intake + seed a role-calibrated profile + mark onboarded. This is
      // fast (~4s). We deliberately DON'T wait for the curriculum here — the
      // dashboard builds it in the background (via /api/init needsPlan) and
      // shows a banner, so the user enters the app immediately.
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role,
          experience: EXPERIENCE.find((e) => e.key === experience)?.label || experience,
          goal: goal.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Setup failed");
      }
      // Straight into the dashboard (server now sees onboarded = true).
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
      setStep("goal");
    }
  }

  const selectedRole = ROLES.find((r) => r.key === role);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      {/* Progress dots */}
      {step !== "building" && (
        <div className="mb-6 flex items-center justify-center gap-1.5">
          {(["name", "role", "experience", "goal"] as Step[]).map((s) => (
            <span
              key={s}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: step === s ? 22 : 8,
                background: step === s ? "var(--accent)" : "var(--line)",
              }}
            />
          ))}
        </div>
      )}

      {step === "name" && (
        <div className="animate-fade-up space-y-4">
          <div>
            <h1 className="text-2xl font-bold leading-tight">Welcome to Butler 🎩</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Your personal mentor. Let&apos;s tailor it to you. First — what should I call you?
            </p>
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-2xl border px-4 py-3 text-base outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card)" }}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep("role")}
          />
          <button
            disabled={!name.trim()}
            onClick={() => setStep("role")}
            className="btn-primary flex w-full items-center justify-center gap-1.5 disabled:opacity-40"
          >
            Continue <ArrowRight size={17} />
          </button>
        </div>
      )}

      {step === "role" && (
        <div className="animate-fade-up space-y-4">
          <div>
            <h1 className="text-2xl font-bold leading-tight">What are you aiming for?</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Butler builds your whole path around this goal. You can change it later.
            </p>
          </div>
          <div className="space-y-2">
            {ROLES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRole(r.key)}
                className="card flex w-full items-center gap-3 text-left transition-transform active:scale-[.99]"
                style={role === r.key ? { outline: "2px solid var(--accent)", outlineOffset: 1 } : undefined}
              >
                <div className="flex-1">
                  <p className="font-semibold leading-tight">{r.label}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {r.blurb}
                  </p>
                </div>
                {role === r.key && (
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep("name")} className="btn-ghost flex items-center gap-1 !px-3">
              <ArrowLeft size={16} />
            </button>
            <button
              disabled={!role}
              onClick={() => setStep("experience")}
              className="btn-primary flex flex-1 items-center justify-center gap-1.5 disabled:opacity-40"
            >
              Continue <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {step === "experience" && (
        <div className="animate-fade-up space-y-4">
          <div>
            <h1 className="text-2xl font-bold leading-tight">How much experience do you have?</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              This calibrates where your path starts — no wrong answer.
            </p>
          </div>
          <div className="space-y-2">
            {EXPERIENCE.map((e) => (
              <button
                key={e.key}
                onClick={() => setExperience(e.key)}
                className="card flex w-full items-center gap-3 text-left transition-transform active:scale-[.99]"
                style={experience === e.key ? { outline: "2px solid var(--accent)", outlineOffset: 1 } : undefined}
              >
                <div className="flex-1">
                  <p className="font-semibold leading-tight">{e.label}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {e.sub}
                  </p>
                </div>
                {experience === e.key && (
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep("role")} className="btn-ghost flex items-center gap-1 !px-3">
              <ArrowLeft size={16} />
            </button>
            <button
              disabled={!experience}
              onClick={() => setStep("goal")}
              className="btn-primary flex flex-1 items-center justify-center gap-1.5 disabled:opacity-40"
            >
              Continue <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {step === "goal" && (
        <div className="animate-fade-up space-y-4">
          <div>
            <h1 className="text-2xl font-bold leading-tight">Anything specific?</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Optional — a goal, a topic you want to nail, or a gap you feel. Butler will weave it in.
            </p>
          </div>
          <textarea
            autoFocus
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={`e.g. "Preparing for a ${selectedRole?.label || "senior"} interview" or "shaky on caching"`}
            rows={3}
            className="w-full rounded-2xl border px-4 py-3 text-base outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card)" }}
          />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => setStep("experience")} className="btn-ghost flex items-center gap-1 !px-3">
              <ArrowLeft size={16} />
            </button>
            <button onClick={finish} className="btn-primary flex flex-1 items-center justify-center gap-1.5">
              Build my path <ArrowRight size={17} />
            </button>
          </div>
          <button
            onClick={finish}
            className="w-full text-center text-xs"
            style={{ color: "var(--muted)" }}
          >
            Skip
          </button>
        </div>
      )}

      {step === "building" && (
        <div className="animate-fade-up space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--accent-soft)" }}>
            <span className="text-2xl">🎩</span>
          </div>
          <h1 className="text-xl font-bold">Setting you up…</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Getting your <b>{selectedRole?.label}</b> profile ready. Your path builds in the
            background — you&apos;ll be in the app in a moment.
          </p>

          {/* Rotating step + progress bar so the ~20s wait feels alive */}
          <div className="card text-left">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: "var(--accent)" }} />
              <p key={buildStep} className="animate-fade-up text-sm font-medium">
                {BUILD_STEPS[buildStep]}
              </p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
              <span
                className="block h-full rounded-full transition-all duration-[3000ms] ease-out"
                style={{
                  width: `${Math.round(((buildStep + 1) / BUILD_STEPS.length) * 100)}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
      )}
    </main>
  );
}
