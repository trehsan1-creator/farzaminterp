/**
 * GET /api/v1/documents — Muse read contract: FY document registry.
 * fiscal_year_id is mandatory; cross-year reads require an explicit second
 * request with the other fiscal_year_id (read-only by contract).
 */

import { NextResponse } from "next/server";
import { requireMuseApiKey, jsonError } from "@/api/v1/auth";
import { API_ERRORS, listDocumentsQuerySchema } from "@/api/v1/contracts";
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
  const parsed = listDocumentsQuerySchema.safeParse({
    fiscal_year_id: url.searchParams.get("fiscal_year_id"),
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(
      API_ERRORS.FISCAL_YEAR_REQUIRED,
      "an explicit fiscal_year_id is required",
      400,
      { issues: parsed.error.issues },
    );
  }

  const client = getServiceClient();
  if (!client) return jsonError(API_ERRORS.NOT_CONFIGURED, "database not configured", 503);

  const limit = parsed.data.limit ?? 100;
  const offset = parsed.data.offset ?? 0;
  const query = client
    .from("documents")
    .select(
      "id, document_type, document_no, document_date, description, currency, amount_total, status, source",
    )
    .eq("fiscal_year_id", parsed.data.fiscal_year_id)
    .order("document_date", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  const { data, error } = await query;
  if (error) return jsonError(API_ERRORS.INTERNAL, error.message, 500);

  return NextResponse.json({ documents: data ?? [], limit, offset });
}
