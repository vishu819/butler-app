// The canonical, browser-facing base URL for auth redirects (email confirmation,
// magic links). Supabase bakes this into the email, so it MUST be the deployed
// origin — not localhost — when running in production.
//
// Priority:
//   1. NEXT_PUBLIC_SITE_URL   — set this on Vercel to your prod URL (recommended)
//   2. window.location.origin — correct for local dev / preview deploys
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
