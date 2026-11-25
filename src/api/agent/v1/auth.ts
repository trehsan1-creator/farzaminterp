/** Scoped Bearer authentication for the PIP Agent API. */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

export type AgentScope = "tasks:read" | "tasks:write" | "audit:read";

export interface AgentAuth {
  keyId: string;
  agentId: string;
  scopes: string[];
}

export type AgentAuthResult =
  | { ok: true; auth: AgentAuth }
  | { ok: false; response: NextResponse };

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function error(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function requireAgentApiKey(request: Request, scope: AgentScope): AgentAuthResult {
  const env = getServerEnv();
  if (!env.agentApiKey) {
    return {
      ok: false,
      response: error("NOT_CONFIGURED", "Agent API credentials are not configured for this environment.", 503),
    };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token || !safeEqual(env.agentApiKey, token)) {
    return {
      ok: false,
      response: error("UNAUTHORIZED", "Missing or invalid bearer token.", 401),
    };
  }

  if (!env.agentApiScopes.includes(scope)) {
    return {
      ok: false,
      response: error("FORBIDDEN", "The configured agent key does not have the required scope.", 403),
    };
  }

  return {
    ok: true,
    auth: {
      keyId: env.agentApiKeyId,
      agentId: env.agentId,
      scopes: env.agentApiScopes,
    },
  };
}
