import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv, hasDatabaseConfig } from "@/lib/env";
import { getServiceClient } from "@/lib/supabase/server";
import { writeAgentAudit } from "@/api/agent/v1/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const secret = getServerEnv().cronSecret;
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!secret) {
    return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not configured." } }, { status: 503 });
  }
  if (!token || !safeEqual(secret, token)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron token." } }, { status: 401 });
  }
  if (!hasDatabaseConfig()) {
    return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Database is not configured." } }, { status: 503 });
  }
  const client = getServiceClient();
  if (!client) {
    return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Database is not configured." } }, { status: 503 });
  }

  const { data, error } = await client.rpc("fz_agent_reap_stale_tasks");
  if (error) {
    await writeAgentAudit({
      actorType: "system",
      actorId: "lease-reaper",
      requestId,
      action: "tasks.reaper.failed",
      method: "GET",
      route: "/api/internal/agent/reap",
      statusCode: 503,
      details: { db_code: error.code },
    });
    return NextResponse.json({ error: { code: "REAPER_FAILED", message: "Could not recover expired task leases." } }, { status: 503 });
  }

  const recovered = Number(data ?? 0);
  const auditOk = await writeAgentAudit({
    actorType: "system",
    actorId: "lease-reaper",
    requestId,
    action: "tasks.reaper.completed",
    method: "GET",
    route: "/api/internal/agent/reap",
    statusCode: 200,
    details: { recovered },
  });
  if (!auditOk) {
    return NextResponse.json({ error: { code: "AUDIT_WRITE_FAILED", message: "Reaper ran but audit could not be stored." } }, { status: 503 });
  }
  return NextResponse.json({ ok: true, recovered });
}
