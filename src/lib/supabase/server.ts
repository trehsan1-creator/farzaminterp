/**
 * Server-side Supabase client factory (service role).
 * Privileged keys stay on the server; this module must never be imported
 * from client components. Returns null when not configured — callers render
 * an explicit "database not configured" state instead of inventing data.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

let cached: SupabaseClient | null | undefined;

export function getServiceClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    cached = null;
    return null;
  }
  cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Test/dev helper to clear the memoized client. */
export function resetServiceClient(): void {
  cached = undefined;
}
