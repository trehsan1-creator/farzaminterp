/**
 * GET /api/v1/health — unauthenticated liveness/version probe.
 * Reveals no data and no configuration secrets.
 */

import { NextResponse } from "next/server";
import { API_VERSION } from "@/api/v1/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    api: API_VERSION,
    service: "farzam-erp",
  });
}
