/**
 * Reconciliation stage: compare source-declared expectations (if any) with
 * what the pipeline actually parsed. Differences become blocking error
 * issues; absent expectations are recorded as an explicit 'partial'
 * reconciliation with an info issue — totals are NEVER invented.
 */

import type {
  ExpectedTotals,
  NormalizedRecord,
  ReconciliationSummary,
  ValidationIssueDraft,
} from "./types";

export interface ReconcileInput {
  expected: ExpectedTotals | null | undefined;
  records: Array<{ normalized: NormalizedRecord }>;
}

export interface ReconcileResult {
  summary: ReconciliationSummary;
  issues: ValidationIssueDraft[];
}

export function reconcileBatch(input: ReconcileInput): ReconcileResult {
  const issues: ValidationIssueDraft[] = [];

  // actuals: rows with a parseable amount (validation status is handled
  // separately; reconciliation compares what the source actually contains)
  const totalsByCurrency: Record<string, bigint> = {};
  let rows = 0;
  for (const { normalized } of input.records) {
    rows += 1;
    if (normalized.amount !== null && normalized.currency) {
      totalsByCurrency[normalized.currency] =
        (totalsByCurrency[normalized.currency] ?? 0n) + BigInt(normalized.amount);
    }
  }
  const actual = {
    rows,
    totalsByCurrency: Object.fromEntries(
      Object.entries(totalsByCurrency).map(([k, v]) => [k, v.toString()]),
    ),
  };

  const expected = input.expected ?? null;
  const hasExpectation =
    expected !== null &&
    (expected.rows !== undefined ||
      expected.totalAmount !== undefined ||
      expected.currency !== undefined);

  if (!hasExpectation) {
    issues.push({
      severity: "info",
      code: "TOTALS_NOT_DECLARED",
      messageFa:
        "منبع مجموع انتظاری اعلام نکرده است؛ تطبیق فقط در سطح رکوردها انجام شد",
    });
    return {
      summary: { status: "partial", expected, actual, differences: [] },
      issues,
    };
  }

  const differences: string[] = [];

  if (expected?.rows !== undefined && expected.rows !== rows) {
    const d = `rows: expected ${expected.rows}, parsed ${rows}`;
    differences.push(d);
    issues.push({
      severity: "error",
      code: "IMPORT_ROWS_MISMATCH",
      messageFa: `تعداد رکوردها با منبع هم‌خوان نیست (انتظار ${expected.rows}، پردازش ${rows})`,
      details: { expected: expected.rows, actual: rows },
    });
  }

  if (expected?.currency && expected.totalAmount !== undefined) {
    const exp = BigInt(expected.totalAmount);
    const act = totalsByCurrency[expected.currency] ?? 0n;
    if (exp !== act) {
      const d = `total ${expected.currency}: expected ${exp}, parsed ${act}`;
      differences.push(d);
      issues.push({
        severity: "error",
        code: "IMPORT_TOTAL_MISMATCH",
        messageFa: `مجموع ${expected.currency} با منبع هم‌خوان نیست (انتظار ${exp}، پردازش ${act})`,
        details: { expected: exp.toString(), actual: act.toString() },
      });
    } else if (Object.keys(totalsByCurrency).length > 1) {
      differences.push("multiple currencies parsed while a single total was declared");
      issues.push({
        severity: "error",
        code: "IMPORT_CURRENCY_MISMATCH",
        messageFa: "رکوردهای چندواحدی با مجموع تک‌واحدی منبع سازگار نیستند",
      });
    }
  }

  const status =
    differences.length === 0 ? "matched" : "mismatched";
  return {
    summary: { status, expected, actual, differences },
    issues,
  };
}
