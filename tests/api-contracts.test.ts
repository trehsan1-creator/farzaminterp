import { describe, expect, it } from "vitest";
import {
  currencyCodeSchema,
  errorEnvelopeSchema,
  listBatchesQuerySchema,
  listDocumentsQuerySchema,
  moneyStringSchema,
  registerImportBatchBodySchema,
} from "@/api/v1/contracts";

describe("API v1 contracts — money travels as exact strings", () => {
  it("accepts integer amount strings", () => {
    expect(moneyStringSchema.safeParse("4200000000").success).toBe(true);
    expect(moneyStringSchema.safeParse("-1500").success).toBe(true);
    expect(moneyStringSchema.safeParse("0").success).toBe(true);
  });

  it("rejects JSON numbers and decimals (no float money)", () => {
    expect(moneyStringSchema.safeParse(4200000000).success).toBe(false);
    expect(moneyStringSchema.safeParse("1.5").success).toBe(false);
    expect(moneyStringSchema.safeParse("1e9").success).toBe(false);
    expect(moneyStringSchema.safeParse("").success).toBe(false);
  });

  it("accepts only IRR and IRT", () => {
    expect(currencyCodeSchema.safeParse("IRR").success).toBe(true);
    expect(currencyCodeSchema.safeParse("IRT").success).toBe(true);
    expect(currencyCodeSchema.safeParse("USD").success).toBe(false);
  });
});

describe("API v1 contracts — explicit fiscal-year scope", () => {
  it("requires fiscal_year_id on document listing", () => {
    expect(listDocumentsQuerySchema.safeParse({}).success).toBe(false);
    expect(
      listDocumentsQuerySchema.safeParse({ fiscal_year_id: "not-a-uuid" }).success,
    ).toBe(false);
    const ok = listDocumentsQuerySchema.safeParse({
      fiscal_year_id: "a1000000-0000-4000-8000-000000000104",
      limit: "50",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.limit).toBe(50);
  });

  it("requires fiscal_year_id on batch listing", () => {
    expect(listBatchesQuerySchema.safeParse({}).success).toBe(false);
    expect(
      listBatchesQuerySchema.safeParse({
        fiscal_year_id: "a1000000-0000-4000-8000-000000000104",
      }).success,
    ).toBe(true);
  });

  it("bounds limit to a sane range", () => {
    expect(
      listDocumentsQuerySchema.safeParse({
        fiscal_year_id: "a1000000-0000-4000-8000-000000000104",
        limit: 1000,
      }).success,
    ).toBe(false);
    expect(
      listDocumentsQuerySchema.safeParse({
        fiscal_year_id: "a1000000-0000-4000-8000-000000000104",
        limit: 0,
      }).success,
    ).toBe(false);
  });
});

describe("API v1 contracts — import batch registration", () => {
  const validBody = {
    fiscal_year_id: "a1000000-0000-4000-8000-000000000104",
    original_filename: "fy1404-source.csv",
    content_sha256: "a".repeat(64),
    byte_size: 1024,
    content_base64: "aGVsbG8=",
  };

  it("accepts a well-formed registration", () => {
    expect(registerImportBatchBodySchema.safeParse(validBody).success).toBe(true);
  });

  it("rejects malformed hashes and negative sizes", () => {
    expect(
      registerImportBatchBodySchema.safeParse({
        ...validBody,
        content_sha256: "xyz",
      }).success,
    ).toBe(false);
    expect(
      registerImportBatchBodySchema.safeParse({ ...validBody, byte_size: -1 }).success,
    ).toBe(false);
    expect(
      registerImportBatchBodySchema.safeParse({ ...validBody, original_filename: "" })
        .success,
    ).toBe(false);
  });

  it("keeps expected totals as exact integer strings", () => {
    const ok = registerImportBatchBodySchema.safeParse({
      ...validBody,
      expected_totals: { rows: 2, total_amount: "999999999", currency: "IRR" },
    });
    expect(ok.success).toBe(true);
    const bad = registerImportBatchBodySchema.safeParse({
      ...validBody,
      expected_totals: { total_amount: 999999999 },
    });
    expect(bad.success).toBe(false);
  });
});

describe("API v1 contracts — error envelope", () => {
  it("shapes errors consistently", () => {
    const parsed = errorEnvelopeSchema.safeParse({
      error: { code: "VALIDATION_FAILED", message: "bad" },
    });
    expect(parsed.success).toBe(true);
    expect(errorEnvelopeSchema.safeParse({ message: "bad" }).success).toBe(false);
  });
});
