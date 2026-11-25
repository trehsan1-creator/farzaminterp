/**
 * GET /api/v1/import-batches — Muse read contract: import batch monitor.
 * fiscal_year_id is mandatory (explicit fiscal-year scope).
 */

import { NextResponse } from "next/server";
import { requireMuseApiKey, jsonError } from "@/api/v1/auth";
import { API_ERRORS, listBatchesQuerySchema } from "@/api/v1/contracts";
import { getServiceClient } from "@/lib/supabase/server";
import { hasDatabaseConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = requireMuseApiKey(request);
  if (!auth.ok) return auth.response;

  if (!hasDatabaseConfig()) {
    return jsonError(API_ERRORS.NOT_CONFIGURED, "database not configured", 503);
  }
  const url = new URL(request.url);
  const parsed = listBatchesQuerySchema.safeParse({
    fiscal_year_id: url.searchParams.get("fiscal_year_id"),
  });
  if (!parsed.success) {
    return jsonError(API_ERRORS.FISCAL_YEAR_REQUIRED, "an explicit fiscal_year_id is required", 400);
  }

  const client = getServiceClient();
  if (!client) return jsonError(API_ERRORS.NOT_CONFIGURED, "database not configured", 503);

  const { data, error } = await client
    .from("import_batches")
    .select(
      "id, pipeline_version, status, stage, error_summary, created_at, posted_at, stats",
    )
    .eq("fiscal_year_id", parsed.data.fiscal_year_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return jsonError(API_ERRORS.INTERNAL, error.message, 500);

  return NextResponse.json({ import_batches: data ?? [] });
}
