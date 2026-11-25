/**
 * Muse API authentication (v1).
 *
 * Stage 00 prepares the boundary only: MUSE_API_KEY is read from the
 * server environment and is intentionally NOT provisioned here. Without
 * configuration the API answers NOT_CONFIGURED instead of accepting
 * anonymous access.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { API_ERRORS } from "./contracts";

export type AuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function requireMuseApiKey(request: Request): AuthResult {
  const env = getServerEnv();
  if (!env.museApiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: API_ERRORS.NOT_CONFIGURED,
            message:
              "Muse API access is not configured for this environment (Stage 00 provisions no credentials).",
          },
        },
        { status: 503 },
      ),
    };
  }
  const provided = request.headers.get("x-muse-api-key");
  if (!provided || !safeEqual(provided, env.museApiKey)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: API_ERRORS.UNAUTHORIZED, message: "invalid or missing API key" } },
        { status: 401 },
      ),
    };
  }
  return { ok: true };
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status });
}
