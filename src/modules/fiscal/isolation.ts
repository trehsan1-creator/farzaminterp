/**
 * Fiscal-year isolation guards (domain mirror of DB triggers in migrations
 * 0002/0005–0009). Fiscal years are independent operational contexts:
 * records must belong to a fiscal year of the same company, stated dates
 * must fall inside that fiscal year, and queries must always be scoped by an
 * EXPLICIT fiscal-year selection — never defaulted from the current date.
 */

import type { FiscalYearWindow } from "@/modules/accounting/journal/validation";

export type FiscalIsolationCode =
  | "FISCAL_YEAR_REQUIRED"
  | "FISCAL_YEAR_COMPANY_MISMATCH"
  | "FISCAL_YEAR_NOT_FOUND"
  | "DATE_OUTSIDE_FISCAL_YEAR"
  | "FISCAL_YEAR_NOT_SELECTED";

export class FiscalIsolationError extends Error {
  readonly code: FiscalIsolationCode;
  constructor(code: FiscalIsolationCode, message: string) {
    super(message);
    this.name = "FiscalIsolationError";
    this.code = code;
  }
}

export interface ScopedRecord {
  companyId: string;
  fiscalYearId: string;
}

/** The record's company must own the fiscal year it claims. */
export function assertFiscalScope(
  record: ScopedRecord,
  fiscalYear: Pick<FiscalYearWindow, "id" | "companyId">,
): void {
  if (!record.fiscalYearId) {
    throw new FiscalIsolationError(
      "FISCAL_YEAR_REQUIRED",
      "fiscal_year_id is required for financial records",
    );
  }
  if (fiscalYear.id !== record.fiscalYearId) {
    throw new FiscalIsolationError(
      "FISCAL_YEAR_NOT_FOUND",
      "provided fiscal year does not match the record's fiscal_year_id",
    );
  }
  if (fiscalYear.companyId !== record.companyId) {
    throw new FiscalIsolationError(
      "FISCAL_YEAR_COMPANY_MISMATCH",
      "fiscal year does not belong to this company",
    );
  }
}

/** A stated date must lie inside the fiscal year (storage dates are ISO). */
export function assertDateInFiscalYear(
  isoDate: string | null | undefined,
  fiscalYear: Pick<FiscalYearWindow, "startDate" | "endDate">,
): void {
  if (isoDate === null || isoDate === undefined || isoDate === "") return;
  if (isoDate < fiscalYear.startDate || isoDate > fiscalYear.endDate) {
    throw new FiscalIsolationError(
      "DATE_OUTSIDE_FISCAL_YEAR",
      `date ${isoDate} is outside ${fiscalYear.startDate}..${fiscalYear.endDate}`,
    );
  }
}

/**
 * Fiscal-year selection must be explicit wherever figures depend on it.
 * Never falls back to "today" or to another year's data.
 */
export function requireFiscalYearSelection(
  selected: string | null | undefined,
): string {
  if (!selected || selected.trim() === "") {
    throw new FiscalIsolationError(
      "FISCAL_YEAR_NOT_SELECTED",
      "an explicit fiscal-year selection is required",
    );
  }
  return selected;
}

/** Build the canonical scoped filter — every list query goes through this. */
export function fiscalScopeFilter(record: ScopedRecord): {
  company_id: { eq: string };
  fiscal_year_id: { eq: string };
} {
  requireFiscalYearSelection(record.fiscalYearId);
  return {
    company_id: { eq: record.companyId },
    fiscal_year_id: { eq: record.fiscalYearId },
  };
}

/**
 * Read-only cross-year access helper: comparing another fiscal year is
 * allowed for analytics, but the result is explicitly marked read-only and
 * can never be used to mutate the source-year records.
 */
export interface CrossYearView<T> {
  sourceFiscalYearId: string;
  targetFiscalYearId: string;
  mode: "read-only";
  rows: T[];
}

export function readOnlyCrossYearView<T>(
  sourceFiscalYearId: string,
  targetFiscalYearId: string,
  rows: T[],
): CrossYearView<T> {
  return {
    sourceFiscalYearId,
    targetFiscalYearId,
    mode: "read-only",
    rows,
  };
}
