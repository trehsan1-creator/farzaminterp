/**
 * Muse / PIP versioned API contracts (v1).
 *
 * Boundaries (AGENTS.md §7):
 *  - versioned, documented JSON contracts only — no direct database access;
 *  - money travels as exact integer strings (never JSON floats);
 *  - dates are canonical ISO; fiscal-year scope is always explicit;
 *  - write operations carry idempotency anchors (content hashes);
 *  - no credential is provisioned in Stage 00 (MUSE_API_KEY stays empty).
 */

import { z } from "zod";

export const API_VERSION = "v1";

/** Exact integer amount string, e.g. "4200000000". Rejects floats. */
export const moneyStringSchema = z
  .string()
  .regex(/^-?\d{1,19}$/, "amount must be an exact integer string");

export const currencyCodeSchema = z.enum(["IRR", "IRT"]);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
export const uuidSchema = z.string().uuid();

export const fiscalYearIdQuerySchema = z.object({
  fiscal_year_id: uuidSchema,
});

export const listDocumentsQuerySchema = z.object({
  fiscal_year_id: uuidSchema,
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const documentSchema = z.object({
  id: uuidSchema,
  document_type: z.string(),
  document_no: z.string().nullable(),
  document_date: isoDateSchema.nullable(),
  description: z.string().nullable(),
  currency: currencyCodeSchema,
  amount_total: moneyStringSchema.nullable(),
  status: z.string(),
  source: z.enum(["manual", "import"]),
});

export const listBatchesQuerySchema = z.object({
  fiscal_year_id: uuidSchema,
});

export const importBatchSchema = z.object({
  id: uuidSchema,
  pipeline_version: z.string(),
  status: z.string(),
  stage: z.string(),
  error_summary: z.string().nullable(),
  created_at: z.string(),
});

export const listIssuesQuerySchema = z.object({
  fiscal_year_id: uuidSchema.optional(),
  severity: z.enum(["error", "warning", "info"]).optional(),
  status: z.enum(["open", "acknowledged", "resolved", "ignored"]).optional(),
});

/** POST /api/v1/import/batches — idempotent source-file + batch registration. */
export const registerImportBatchBodySchema = z.object({
  fiscal_year_id: uuidSchema,
  original_filename: z.string().min(1).max(512),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byte_size: z.number().int().positive(),
  /** base64 of the raw bytes (server verifies the declared hash). */
  content_base64: z.string().min(1),
  pipeline_version: z.string().min(1).optional(),
  expected_totals: z
    .object({
      rows: z.number().int().nonnegative().optional(),
      total_amount: moneyStringSchema.optional(),
      currency: currencyCodeSchema.optional(),
    })
    .optional(),
  declared_currency: currencyCodeSchema.optional(),
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type DocumentDto = z.infer<typeof documentSchema>;
export type ImportBatchDto = z.infer<typeof importBatchSchema>;
export type RegisterImportBatchBody = z.infer<typeof registerImportBatchBodySchema>;

/** Stable error codes shared with clients. */
export const API_ERRORS = {
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_CONFIGURED: "NOT_CONFIGURED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  FISCAL_YEAR_REQUIRED: "FISCAL_YEAR_REQUIRED",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL",
} as const;
