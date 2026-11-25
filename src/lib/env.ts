/**
 * Environment access — server-side only values never reach the browser.
 * Missing Supabase configuration is a first-class state in Stage 00: the UI
 * shows setup guidance instead of fabricating data.
 */

export interface ServerEnv {
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
  storageBucket: string;
  museApiKey: string | null;
}

export function getServerEnv(): ServerEnv {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "import-source",
    museApiKey: process.env.MUSE_API_KEY ?? null,
  };
}

export function hasDatabaseConfig(): boolean {
  const env = getServerEnv();
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}
