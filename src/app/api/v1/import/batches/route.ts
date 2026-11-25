/**
 * POST /api/v1/import/batches — Muse write contract (v1): register a raw
 * source file and create (or resolve) its idempotent import batch.
 *
 * Guarantees:
 *  - the declared content_sha256 is verified against the uploaded bytes
 *    before anything is written (HASH_MISMATCH aborts);
 *  - identical bytes + fiscal year + pipeline version resolve to the SAME
 *    batch (no duplicate financial records on retry);
 *  - no data is normalized or posted by this endpoint — staging runs as a
 *    separate, observable pipeline step.
 *
 * This is a boundary stub for Stage 00: full pipeline execution over HTTP
 * lands with the import service wiring in the next stage.
 */

import { NextResponse } from "next/server";
import { requireMuseApiKey, jsonError } from "@/api/v1/auth";
import { API_ERRORS, registerImportBatchBodySchema } from "@/api/v1/contracts";
import { getServiceClient } from "@/lib/supabase/server";
import { hasDatabaseConfig } from "@/lib/env";
import { sha256Hex, computeIdempotencyKey } from "@/modules/imports/hashing";
import { PIPELINE_VERSION } from "@/modules/imports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const auth = requireMuseApiKey(request);
  if (!auth.ok) return auth.response;

  if (!hasDatabaseConfig()) {
    return jsonError(API_ERRORS.NOT_CONFIGURED, "database not configured", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(API_ERRORS.VALIDATION_FAILED, "invalid JSON body", 400);
  }
  const parsed = registerImportBatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(API_ERRORS.VALIDATION_FAILED, "request body failed validation", 400, {
      issues: parsed.error.issues,
    });
  }
  const input = parsed.data;

  // verify hash BEFORE any write
  const bytes = Buffer.from(input.content_base64, "base64");
  const computed = sha256Hex(bytes);
  if (computed !== input.content_sha256) {
    return jsonError(
      API_ERRORS.VALIDATION_FAILED,
      "declared content_sha256 does not match the uploaded bytes",
      400,
      { computed },
    );
  }
  if (bytes.byteLength !== input.byte_size) {
    return jsonError(API_ERRORS.VALIDATION_FAILED, "byte_size does not match content", 400);
  }

  const client = getServiceClient();
  if (!client) return jsonError(API_ERRORS.NOT_CONFIGURED, "database not configured", 503);

  // fiscal year must exist and be explicit
  const { data: fy, error: fyErr } = await client
    .from("fiscal_years")
    .select("id, company_id")
    .eq("id", input.fiscal_year_id)
    .maybeSingle();
  if (fyErr) return jsonError(API_ERRORS.INTERNAL, fyErr.message, 500);
  if (!fy) return jsonError(API_ERRORS.NOT_FOUND, "fiscal year not found", 404);

  const pipelineVersion = input.pipeline_version ?? PIPELINE_VERSION;
  const idempotencyKey = computeIdempotencyKey({
    companyId: fy["company_id"] as string,
    fiscalYearId: input.fiscal_year_id,
    sourceSha256: computed,
    pipelineVersion,
  });

  // source file registration (idempotent on company + sha256)
  let sourceFileId: string;
  const { data: existingFile, error: selFileErr } = await client
    .from("import_source_files")
    .select("id")
    .eq("company_id", fy["company_id"])
    .eq("content_sha256", computed)
    .maybeSingle();
  if (selFileErr) return jsonError(API_ERRORS.INTERNAL, selFileErr.message, 500);
  if (existingFile) {
    sourceFileId = existingFile["id"] as string;
  } else {
    const { data: newFile, error: insFileErr } = await client
      .from("import_source_files")
      .insert({
        company_id: fy["company_id"],
        original_filename: input.original_filename,
        storage_bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "import-source",
        storage_path: `${input.fiscal_year_id}/${computed}/${input.original_filename}`,
        content_sha256: computed,
        byte_size: input.byte_size,
      })
      .select("id")
      .single();
    if (insFileErr) {
      if (insFileErr.code === "23505") {
        const { data: raced } = await client
          .from("import_source_files")
          .select("id")
          .eq("company_id", fy["company_id"])
          .eq("content_sha256", computed)
          .single();
        sourceFileId = raced!["id"] as string;
      } else {
        return jsonError(API_ERRORS.INTERNAL, insFileErr.message, 500);
      }
    } else {
      sourceFileId = newFile!["id"] as string;
    }
  }

  // batch creation (idempotent on idempotency_key)
  const { data: existingBatch, error: selBatchErr } = await client
    .from("import_batches")
    .select("id, status, stage")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (selBatchErr) return jsonError(API_ERRORS.INTERNAL, selBatchErr.message, 500);
  if (existingBatch) {
    return NextResponse.json(
      {
        batch_id: existingBatch["id"],
        status: existingBatch["status"],
        stage: existingBatch["stage"],
        created: false,
        idempotency_key: idempotencyKey,
      },
      { status: 200 },
    );
  }

  const { data: newBatch, error: insBatchErr } = await client
    .from("import_batches")
    .insert({
      company_id: fy["company_id"],
      fiscal_year_id: input.fiscal_year_id,
      source_file_id: sourceFileId,
      pipeline_version: pipelineVersion,
      idempotency_key: idempotencyKey,
      expected_totals: input.expected_totals ?? null,
    })
    .select("id, status, stage")
    .single();
  if (insBatchErr) {
    if (insBatchErr.code === "23505") {
      const { data: raced } = await client
        .from("import_batches")
        .select("id, status, stage")
        .eq("idempotency_key", idempotencyKey)
        .single();
      return NextResponse.json(
        {
          batch_id: raced!["id"],
          status: raced!["status"],
          stage: raced!["stage"],
          created: false,
          idempotency_key: idempotencyKey,
        },
        { status: 200 },
      );
    }
    return jsonError(API_ERRORS.INTERNAL, insBatchErr.message, 500);
  }

  return NextResponse.json(
    {
      batch_id: newBatch!["id"],
      status: newBatch!["status"],
      stage: newBatch!["stage"],
      created: true,
      idempotency_key: idempotencyKey,
    },
    { status: 201 },
  );
}
