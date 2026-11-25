/**
 * GET /api/v1/fiscal-years — Muse read contract: fiscal-year workspaces.
 * Explicitly scoped by company (query param). Never derives fiscal context
 * from the current date.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMuseApiKey, jsonError } from "@/api/v1/auth";
import { API_ERRORS, uuidSchema } from "@/api/v1/contracts";
import { getServiceClient } from "@/lib/supabase/server";
import { hasDatabaseConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ company_id: uuidSchema });

export async function GET(request: Request): Promise<NextResponse> {
  const auth = requireMuseApiKey(request);
  if (!auth.ok) return auth.response;

  if (!hasDatabaseConfig()) {
    return jsonError(API_ERRORS.NOT_CONFIGURED, "database not configured", 503);
  }
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ company_id: url.searchParams.get("company_id") });
  if (!parsed.success) {
    return jsonError(API_ERRORS.VALIDATION_FAILED, "company_id (uuid) is required", 400, {
      issues: parsed.error.issues,
    });
  }

  const client = getServiceClient();
  if (!client) return jsonError(API_ERRORS.NOT_CONFIGURED, "database not configured", 503);

  const { data, error } = await client
    .from("fiscal_years")
    .select("id, label, start_date, end_date, status, is_reconstruction")
    .eq("company_id", parsed.data.company_id)
    .order("start_date", { ascending: false });
  if (error) return jsonError(API_ERRORS.INTERNAL, error.message, 500);

  return NextResponse.json({ fiscal_years: data ?? [] });
}
