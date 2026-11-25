/**
 * Staging validation stage: business rules over normalized records.
 * Every failure becomes an explicit exception-queue issue (never silently
 * fixed, never invented). Only records with zero error issues are 'valid'.
 */

import type { FiscalYearWindow } from "@/modules/accounting/journal/validation";
import type {
  NormalizedRecord,
  ValidationIssueDraft,
} from "./types";
import { POSTABLE_RECORD_KINDS } from "./types";

export interface ValidationContext {
  fiscalYear: Pick<FiscalYearWindow, "startDate" | "endDate">;
  /** Postable, active account codes of the FY chart of accounts. */
  postableAccountCodes: ReadonlySet<string>;
}

export interface RecordValidation {
  status: "valid" | "invalid";
  issues: ValidationIssueDraft[];
}

export function validateNormalizedRecord(
  normalized: NormalizedRecord,
  ctx: ValidationContext,
  sourceRef: string,
): RecordValidation {
  const issues: ValidationIssueDraft[] = [];
  const push = (
    severity: "error" | "warning" | "info",
    code: string,
    messageFa: string,
    field?: string,
  ) => {
    issues.push({ severity, code, messageFa, sourceRef, field });
  };

  // 1) record kinds this pipeline version can post
  if (!POSTABLE_RECORD_KINDS.includes(normalized.kind)) {
    push(
      "error",
      "KIND_NOT_SUPPORTED",
      `نوع رکورد «${normalized.kind}» در نسخه فعلی خط لوله پشتیبانی نمی‌شود`,
      "record_kind",
    );
  }

  // 2) date: required, parseable, inside the fiscal year
  if (normalized.dateParseFailed) {
    push("error", "DATE_INVALID", "تاریخ قابل خواندن نیست", "date");
  } else if (!normalized.date) {
    push("error", "DATE_MISSING", "تاریخ در منبع ثبت نشده است", "date");
  } else if (
    normalized.date < ctx.fiscalYear.startDate ||
    normalized.date > ctx.fiscalYear.endDate
  ) {
    push(
      "error",
      "DATE_OUTSIDE_FISCAL_YEAR",
      `تاریخ ${normalized.date} خارج از سال مالی است`,
      "date",
    );
  }

  // 3) amount: exact integer, required for these kinds
  if (normalized.amountParseFailed) {
    // already reported during normalization; keep invalid
    push("error", "AMOUNT_INVALID", "مبلغ نامعتبر است", "amount");
  } else if (normalized.amount === null) {
    push("error", "AMOUNT_MISSING", "مبلغ در منبع ثبت نشده است", "amount");
  }

  // 4) currency: explicitly stated or explicitly declared — never inferred
  if (!normalized.currency) {
    push(
      "error",
      "CURRENCY_MISSING",
      "واحد پول (ریال/تومان) در منبع مشخص نشده است",
      "currency",
    );
  }

  // 5) kind-specific rules
  if (normalized.kind === "document" && !normalized.documentType) {
    push(
      "error",
      "DOCUMENT_TYPE_MISSING",
      "نوع سند مشخص نشده است",
      "document_type",
    );
  }

  if (normalized.kind === "journal_candidate") {
    const lines = normalized.lines ?? [];
    if (lines.length < 2) {
      push(
        "error",
        "JOURNAL_TOO_FEW_LINES",
        "سند دفتری به حداقل دو ردیف نیاز دارد",
        "lines",
      );
    }
    for (const [i, line] of lines.entries()) {
      const ref = `lines[${i + 1}]`;
      if (!line.accountCode) {
        push("error", "ACCOUNT_CODE_MISSING", `${ref}: کد حساب خالی است`, ref);
      } else if (!ctx.postableAccountCodes.has(line.accountCode)) {
        push(
          "error",
          "ACCOUNT_NOT_FOUND",
          `${ref}: کد حساب «${line.accountCode}» در چارت حساب‌های این سال مالی یافت نشد`,
          ref,
        );
      }
      if (!line.currency) {
        push(
          "error",
          "LINE_CURRENCY_MISSING",
          `${ref}: واحد پول ردیف مشخص نشده است`,
          ref,
        );
      }
      if (!line.amount || BigInt(line.amount) <= 0n) {
        push("error", "LINE_AMOUNT_INVALID", `${ref}: مبلغ باید مثبت باشد`, ref);
      }
    }
    const debit = new Map<string, bigint>();
    const credit = new Map<string, bigint>();
    for (const line of lines) {
      if (!line.currency || !line.amount) continue;
      const target = line.side === "debit" ? debit : credit;
      target.set(
        line.currency,
        (target.get(line.currency) ?? 0n) + BigInt(line.amount),
      );
    }
    for (const currency of new Set([...debit.keys(), ...credit.keys()])) {
      const d = debit.get(currency) ?? 0n;
      const c = credit.get(currency) ?? 0n;
      if (d !== c) {
        push(
          "error",
          "JOURNAL_UNBALANCED",
          `ردیف‌های دفتری ${currency} متوازن نیستند (بدهکار ${d} / بستانکار ${c})`,
          "lines",
        );
      }
    }
  }

  const hasError = issues.some((i) => i.severity === "error");
  return { status: hasError ? "invalid" : "valid", issues };
}
