/**
 * Double-entry journal validation (domain mirror of the database rules in
 * migration 0008). Posted entries must balance per currency; amounts are
 * exact BigInt integers with an explicit currency — never floats, never
 * mixed-currency nets.
 */

import {
  addMoney,
  assertCurrencyCode,
  type CurrencyCode,
} from "@/lib/money";

export type JournalSide = "debit" | "credit";

export interface JournalLineInput {
  side: JournalSide;
  amount: bigint;
  currency: CurrencyCode;
  accountCode: string;
  description?: string;
}

export interface FiscalYearWindow {
  id: string;
  companyId: string;
  /** ISO date strings (canonical storage). */
  startDate: string;
  endDate: string;
  status: "open" | "locked" | "closed";
}

export interface JournalDraftInput {
  fiscalYear: FiscalYearWindow;
  /** ISO date (YYYY-MM-DD), canonical storage. */
  entryDate: string;
  lines: JournalLineInput[];
}

export type JournalValidationCode =
  | "ENTRY_TOO_FEW_LINES"
  | "ENTRY_UNBALANCED"
  | "LINE_AMOUNT_NOT_POSITIVE"
  | "LINE_CURRENCY_UNKNOWN"
  | "LINE_ACCOUNT_REQUIRED"
  | "DATE_OUTSIDE_FISCAL_YEAR"
  | "FISCAL_YEAR_NOT_OPEN";

export class JournalValidationError extends Error {
  readonly code: JournalValidationCode;
  constructor(code: JournalValidationCode, message: string) {
    super(message);
    this.name = "JournalValidationError";
    this.code = code;
  }
}

export interface CurrencyTotals {
  currency: CurrencyCode;
  debit: bigint;
  credit: bigint;
  balanced: boolean;
}

export type JournalCheckResult =
  | { ok: true; totals: CurrencyTotals[] }
  | { ok: false; code: JournalValidationCode; message: string };

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Non-throwing balance/shape check. Mirrors fz_assert_entry_balanced. */
export function checkJournalDraft(draft: JournalDraftInput): JournalCheckResult {
  const { fiscalYear, entryDate, lines } = draft;

  if (!isIsoDate(entryDate)) {
    return {
      ok: false,
      code: "DATE_OUTSIDE_FISCAL_YEAR",
      message: `entry date must be canonical ISO: ${entryDate}`,
    };
  }
  if (entryDate < fiscalYear.startDate || entryDate > fiscalYear.endDate) {
    return {
      ok: false,
      code: "DATE_OUTSIDE_FISCAL_YEAR",
      message: `entry date ${entryDate} is outside fiscal year ${fiscalYear.startDate}..${fiscalYear.endDate}`,
    };
  }
  if (fiscalYear.status !== "open") {
    return {
      ok: false,
      code: "FISCAL_YEAR_NOT_OPEN",
      message: `fiscal year ${fiscalYear.id} is ${fiscalYear.status}`,
    };
  }

  if (lines.length < 2) {
    return {
      ok: false,
      code: "ENTRY_TOO_FEW_LINES",
      message: "a journal entry requires at least two lines",
    };
  }

  const totals = new Map<CurrencyCode, { debit: bigint; credit: bigint }>();
  for (const [i, line] of lines.entries()) {
    if (!line.accountCode || line.accountCode.trim() === "") {
      return {
        ok: false,
        code: "LINE_ACCOUNT_REQUIRED",
        message: `line ${i + 1} has no account code`,
      };
    }
    if (line.amount <= 0n) {
      return {
        ok: false,
        code: "LINE_AMOUNT_NOT_POSITIVE",
        message: `line ${i + 1} amount must be a positive exact integer`,
      };
    }
    let currency: CurrencyCode;
    try {
      currency = assertCurrencyCode(line.currency);
    } catch {
      return {
        ok: false,
        code: "LINE_CURRENCY_UNKNOWN",
        message: `line ${i + 1} has an unknown currency`,
      };
    }
    const t = totals.get(currency) ?? { debit: 0n, credit: 0n };
    if (line.side === "debit") t.debit = addMoney(t.debit, line.amount);
    else t.credit = addMoney(t.credit, line.amount);
    totals.set(currency, t);
  }

  const result: CurrencyTotals[] = [];
  let balanced = true;
  for (const [currency, t] of totals) {
    const isBalanced = t.debit === t.credit && t.debit > 0n;
    if (!isBalanced) balanced = false;
    result.push({ currency, debit: t.debit, credit: t.credit, balanced: isBalanced });
  }

  if (!balanced) {
    const detail = result
      .map((t) => `${t.currency}: Dr ${t.debit} / Cr ${t.credit}`)
      .join("; ");
    return {
      ok: false,
      code: "ENTRY_UNBALANCED",
      message: `debits must equal credits for every currency (${detail})`,
    };
  }
  return { ok: true, totals: result };
}

/** Throwing variant used at posting gates. */
export function assertJournalDraftBalanced(draft: JournalDraftInput): CurrencyTotals[] {
  const res = checkJournalDraft(draft);
  if (!res.ok) throw new JournalValidationError(res.code, res.message);
  return res.totals;
}
