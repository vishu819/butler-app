import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. SERVER ONLY. Used by the cron job to
// write daily_content. Never import this into a client component.
//
// Singleton: the admin client uses a static service key (no per-user session),
// so it's safe to reuse one instance across requests. Reusing it keeps the
// underlying HTTP keep-alive pool warm instead of rebuilding per call.
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return cached;
}
