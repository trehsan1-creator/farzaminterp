/**
 * Environment access — privileged values never reach the browser.
 * This module is server-only; never import it from a client component.
 */
export interface ServerEnv {
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
  storageBucket: string;
  museApiKey: string | null;
  agentApiKey: string | null;
  agentApiKeyId: string;
  agentId: string;
  agentCompanyId: string | null;
  agentApiScopes: string[];
  cronSecret: string | null;
}

export function getServerEnv(): ServerEnv {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "import-source",
    museApiKey: process.env.MUSE_API_KEY ?? null,
    agentApiKey: process.env.AGENT_API_KEY ?? null,
    agentApiKeyId: process.env.AGENT_API_KEY_ID ?? "pip-dev",
    agentId: process.env.AGENT_ID ?? "pip",
    agentCompanyId: process.env.AGENT_COMPANY_ID ?? null,
    agentApiScopes: (process.env.AGENT_API_SCOPES ?? "tasks:read,tasks:write,audit:read")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    cronSecret: process.env.CRON_SECRET ?? null,
  };
}

export function hasDatabaseConfig(): boolean {
  const env = getServerEnv();
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}
