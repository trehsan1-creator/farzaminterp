import { describe, expect, it } from "vitest";
import {
  assertJournalDraftBalanced,
  checkJournalDraft,
  JournalValidationError,
  type FiscalYearWindow,
  type JournalDraftInput,
} from "@/modules/accounting/journal/validation";

const fy: FiscalYearWindow = {
  id: "fy-1404",
  companyId: "company-1",
  startDate: "2025-03-21",
  endDate: "2026-03-20",
  status: "open",
};

function draft(overrides: Partial<JournalDraftInput> = {}): JournalDraftInput {
  return {
    fiscalYear: fy,
    entryDate: "2025-04-15",
    lines: [
      { side: "debit", amount: 1000n, currency: "IRR", accountCode: "1000" },
      { side: "credit", amount: 1000n, currency: "IRR", accountCode: "4000" },
    ],
    ...overrides,
  };
}

describe("journal balancing", () => {
  it("accepts a balanced two-line entry", () => {
    const res = checkJournalDraft(draft());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.totals).toEqual([
        { currency: "IRR", debit: 1000n, credit: 1000n, balanced: true },
      ]);
      expect(() => assertJournalDraftBalanced(draft())).not.toThrow();
    }
  });

  it("rejects an unbalanced entry", () => {
    const res = checkJournalDraft(
      draft({
        lines: [
          { side: "debit", amount: 1000n, currency: "IRR", accountCode: "1000" },
          { side: "credit", amount: 999n, currency: "IRR", accountCode: "4000" },
        ],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ENTRY_UNBALANCED");
    expect(() => assertJournalDraftBalanced(draft({
      lines: [
        { side: "debit", amount: 1000n, currency: "IRR", accountCode: "1000" },
        { side: "credit", amount: 999n, currency: "IRR", accountCode: "4000" },
      ],
    }))).toThrowError(JournalValidationError);
  });

  it("rejects a single-line entry", () => {
    const res = checkJournalDraft(
      draft({
        lines: [{ side: "debit", amount: 1000n, currency: "IRR", accountCode: "1000" }],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ENTRY_TOO_FEW_LINES");
  });

  it("never nets different currencies against each other", () => {
    // Dr IRR 1000 / Cr IRT 1000 must NOT count as balanced
    const res = checkJournalDraft(
      draft({
        lines: [
          { side: "debit", amount: 1000n, currency: "IRR", accountCode: "1000" },
          { side: "credit", amount: 1000n, currency: "IRT", accountCode: "4000" },
        ],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ENTRY_UNBALANCED");
  });

  it("balances each currency independently in multi-currency entries", () => {
    const res = checkJournalDraft(
      draft({
        lines: [
          { side: "debit", amount: 1000n, currency: "IRR", accountCode: "1000" },
          { side: "credit", amount: 1000n, currency: "IRR", accountCode: "4000" },
          { side: "debit", amount: 50n, currency: "IRT", accountCode: "1001" },
          { side: "credit", amount: 50n, currency: "IRT", accountCode: "4001" },
        ],
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.totals).toHaveLength(2);
  });

  it("rejects non-positive line amounts", () => {
    const res = checkJournalDraft(
      draft({
        lines: [
          { side: "debit", amount: 0n, currency: "IRR", accountCode: "1000" },
          { side: "credit", amount: 0n, currency: "IRR", accountCode: "4000" },
        ],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("LINE_AMOUNT_NOT_POSITIVE");
  });

  it("rejects entry dates outside the fiscal year", () => {
    const before = checkJournalDraft(draft({ entryDate: "2025-03-20" }));
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.code).toBe("DATE_OUTSIDE_FISCAL_YEAR");

    const after = checkJournalDraft(draft({ entryDate: "2026-03-21" }));
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.code).toBe("DATE_OUTSIDE_FISCAL_YEAR");

    // boundary dates of FY1404 are valid
    expect(checkJournalDraft(draft({ entryDate: "2025-03-21" })).ok).toBe(true);
    expect(checkJournalDraft(draft({ entryDate: "2026-03-20" })).ok).toBe(true);
  });

  it("refuses posting into locked or closed fiscal years", () => {
    const locked = checkJournalDraft(
      draft({ fiscalYear: { ...fy, status: "locked" } }),
    );
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.code).toBe("FISCAL_YEAR_NOT_OPEN");

    const closed = checkJournalDraft(
      draft({ fiscalYear: { ...fy, status: "closed" } }),
    );
    expect(closed.ok).toBe(false);
    if (!closed.ok) expect(closed.code).toBe("FISCAL_YEAR_NOT_OPEN");
  });

  it("requires account codes on every line", () => {
    const res = checkJournalDraft(
      draft({
        lines: [
          { side: "debit", amount: 1000n, currency: "IRR", accountCode: "" },
          { side: "credit", amount: 1000n, currency: "IRR", accountCode: "4000" },
        ],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("LINE_ACCOUNT_REQUIRED");
  });
});
