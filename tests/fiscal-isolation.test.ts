import { describe, expect, it } from "vitest";
import {
  assertDateInFiscalYear,
  assertFiscalScope,
  FiscalIsolationError,
  fiscalScopeFilter,
  readOnlyCrossYearView,
  requireFiscalYearSelection,
} from "@/modules/fiscal/isolation";

const fy1404 = { id: "fy-1404", companyId: "company-a" };
const otherCompanyFy = { id: "fy-1404", companyId: "company-b" };

describe("fiscal-year isolation", () => {
  it("accepts records scoped to a fiscal year of the same company", () => {
    expect(() =>
      assertFiscalScope({ companyId: "company-a", fiscalYearId: "fy-1404" }, fy1404),
    ).not.toThrow();
  });

  it("rejects records missing a fiscal year", () => {
    expect(() =>
      assertFiscalScope({ companyId: "company-a", fiscalYearId: "" }, fy1404),
    ).toThrowError(FiscalIsolationError);
    try {
      assertFiscalScope({ companyId: "company-a", fiscalYearId: "" }, fy1404);
    } catch (e) {
      expect((e as FiscalIsolationError).code).toBe("FISCAL_YEAR_REQUIRED");
    }
  });

  it("rejects cross-company fiscal year usage", () => {
    try {
      assertFiscalScope(
        { companyId: "company-a", fiscalYearId: "fy-1404" },
        otherCompanyFy,
      );
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as FiscalIsolationError).code).toBe("FISCAL_YEAR_COMPANY_MISMATCH");
    }
  });

  it("rejects a fiscal year id that does not match the provided window", () => {
    try {
      assertFiscalScope({ companyId: "company-a", fiscalYearId: "fy-1405" }, fy1404);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as FiscalIsolationError).code).toBe("FISCAL_YEAR_NOT_FOUND");
    }
  });

  it("rejects dates outside the fiscal year but allows unstated dates", () => {
    const window = { startDate: "2025-03-21", endDate: "2026-03-20" };
    expect(() => assertDateInFiscalYear("2025-03-21", window)).not.toThrow();
    expect(() => assertDateInFiscalYear("2026-03-20", window)).not.toThrow();
    expect(() => assertDateInFiscalYear("2025-03-20", window)).toThrowError(
      FiscalIsolationError,
    );
    expect(() => assertDateInFiscalYear("2026-03-21", window)).toThrowError(
      FiscalIsolationError,
    );
    // missing dates are never invented — they are simply unstated
    expect(() => assertDateInFiscalYear(null, window)).not.toThrow();
    expect(() => assertDateInFiscalYear(undefined, window)).not.toThrow();
    expect(() => assertDateInFiscalYear("", window)).not.toThrow();
  });

  it("requires an explicit fiscal-year selection (no defaulting)", () => {
    expect(requireFiscalYearSelection("fy-1404")).toBe("fy-1404");
    for (const bad of [undefined, null, "", "   "]) {
      try {
        requireFiscalYearSelection(bad);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as FiscalIsolationError).code).toBe("FISCAL_YEAR_NOT_SELECTED");
      }
    }
  });

  it("scopes every list query to company + fiscal year", () => {
    expect(fiscalScopeFilter({ companyId: "c1", fiscalYearId: "f1" })).toEqual({
      company_id: { eq: "c1" },
      fiscal_year_id: { eq: "f1" },
    });
    expect(() => fiscalScopeFilter({ companyId: "c1", fiscalYearId: "" })).toThrowError(
      FiscalIsolationError,
    );
  });

  it("marks cross-year comparison as read-only analytics", () => {
    const view = readOnlyCrossYearView("fy-1404", "fy-1405", [{ amount: 1n }]);
    expect(view.mode).toBe("read-only");
    expect(view.sourceFiscalYearId).toBe("fy-1404");
    expect(view.targetFiscalYearId).toBe("fy-1405");
  });

  it("keeps fiscal years independent (different years never share scope)", () => {
    const a = fiscalScopeFilter({ companyId: "company-a", fiscalYearId: "fy-1404" });
    const b = fiscalScopeFilter({ companyId: "company-a", fiscalYearId: "fy-1405" });
    expect(a.fiscal_year_id.eq).not.toBe(b.fiscal_year_id.eq);
    expect(() =>
      assertFiscalScope({ companyId: "company-a", fiscalYearId: "fy-1405" }, fy1404),
    ).toThrowError(FiscalIsolationError);
  });
});
