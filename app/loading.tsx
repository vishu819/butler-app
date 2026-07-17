// Branded splash shown by Next.js while the home route loads (server render /
// data fetch). Centered Butler logo with a soft pulse — a native-app-style launch.
export default function Loading() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-4"
      style={{ background: "linear-gradient(180deg, var(--bg-grad-1), var(--bg-grad-2))" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/butler-logo.svg"
        alt="Butler"
        className="h-20 w-20 rounded-3xl animate-pulse-soft"
        style={{ boxShadow: "0 16px 34px -16px rgba(17,17,18,0.45)" }}
      />
      <p className="text-sm font-semibold tracking-tight" style={{ color: "var(--muted)" }}>
        Butler
      </p>
    </main>
  );
}
