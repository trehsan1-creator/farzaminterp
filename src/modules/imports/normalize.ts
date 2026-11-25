/**
 * Data normalization stage: raw source fields -> type-checked canonical
 * values. Never invents anything: missing currency/date/amount stay null and
 * become validation errors. Jalali source dates are converted to canonical
 * ISO; localized digits are normalized at the boundary.
 */

import {
  detectExplicitCurrency,
  parseAmount,
} from "@/lib/money";
import { parseIsoDate, parseJalaliDate, formatGregorianIso, toGregorian } from "@/lib/jalali";
import type {
  CurrencyCode,
} from "@/lib/money";
import type {
  JournalLineSource,
  NormalizationError,
  NormalizedJournalLine,
  NormalizedRecord,
  RecordKind,
  SourceRecord,
} from "./types";

const DOCUMENT_TYPES = new Set([
  "journal",
  "sales_invoice",
  "purchase_invoice",
  "bank_transaction",
  "tax_return",
  "fixed_asset",
  "other",
]);

const KNOWN_KINDS = new Set<RecordKind>([
  "document",
  "bank_transaction",
  "sales_invoice",
  "purchase_invoice",
  "journal_candidate",
  "tax_return",
  "fixed_asset",
]);

export interface NormalizeOptions {
  /** Fallback kind when the row carries no record_kind column. */
  defaultKind?: RecordKind;
  /**
   * Explicitly declared currency for the batch (operator input at
   * registration). Used only when a row states no unit — never inferred
   * from magnitude.
   */
  declaredCurrency?: CurrencyCode | null;
}

export interface NormalizeOutcome {
  normalized: NormalizedRecord;
  errors: NormalizationError[];
}

/** Parse a raw date field: canonical ISO or Jalali (YYYY/M/D). */
export function normalizeDateField(raw: string | undefined): {
  iso: string | null;
  failed: boolean;
} {
  if (raw === undefined || raw.trim() === "") return { iso: null, failed: false };
  const s = raw.trim();
  if (parseIsoDate(s)) return { iso: s, failed: false };
  const j = parseJalaliDate(s);
  if (j) return { iso: formatGregorianIso(toGregorian(j)), failed: false };
  return { iso: null, failed: true };
}

function resolveCurrency(
  fields: Record<string, string>,
  declared: CurrencyCode | null | undefined,
): { currency: CurrencyCode | null; explicit: boolean } {
  const raw = fields["currency"];
  if (raw && raw.trim() !== "") {
    const detected = detectExplicitCurrency(raw);
    if (detected) return { currency: detected, explicit: true };
    // an unrecognised unit token is not a currency we can accept
    return { currency: null, explicit: false };
  }
  // Some sources embed the unit inside the amount field ("12,000 ریال").
  const amountRaw = fields["amount"];
  if (amountRaw) {
    const detected = detectExplicitCurrency(amountRaw);
    if (detected) return { currency: detected, explicit: true };
  }
  if (declared) return { currency: declared, explicit: true };
  return { currency: null, explicit: false };
}

function normalizeLine(
  line: JournalLineSource,
  fallbackCurrency: CurrencyCode | null,
  errors: NormalizationError[],
  index: number,
): NormalizedJournalLine {
  const accountCode = (line.account_code ?? "").trim();
  if (!accountCode) {
    errors.push({
      code: "LINE_ACCOUNT_REQUIRED",
      messageFa: `ردیف ${index + 1}: کد حساب وارد نشده است`,
      field: `lines[${index}].account_code`,
    });
  }
  const side = line.side === "debit" || line.side === "credit" ? line.side : null;
  if (!side) {
    errors.push({
      code: "LINE_SIDE_INVALID",
      messageFa: `ردیف ${index + 1}: بدهکار/بستانکار نامعتبر است`,
      field: `lines[${index}].side`,
    });
  }
  let amount: string | null = null;
  try {
    amount = parseAmount(line.amount ?? "").toString();
  } catch {
    errors.push({
      code: "AMOUNT_INVALID",
      messageFa: `ردیف ${index + 1}: مبلغ نامعتبر است`,
      field: `lines[${index}].amount`,
    });
  }
  let currency: CurrencyCode | null = fallbackCurrency;
  if (line.currency && line.currency.trim() !== "") {
    const detected = detectExplicitCurrency(line.currency);
    if (detected) currency = detected;
    else {
      errors.push({
        code: "LINE_CURRENCY_UNKNOWN",
        messageFa: `ردیف ${index + 1}: واحد پول نامعتبر است`,
        field: `lines[${index}].currency`,
      });
      currency = null;
    }
  }
  return {
    accountCode,
    side: side ?? "debit",
    amount: amount ?? "0",
    currency,
    description: line.description,
  };
}

export function normalizeSourceRecord(
  record: SourceRecord,
  opts: NormalizeOptions = {},
): NormalizeOutcome {
  const errors: NormalizationError[] = [];
  const f = record.fields;

  const kindRaw = (f["record_kind"] ?? "").trim();
  let kind: RecordKind;
  if (kindRaw === "") {
    kind = opts.defaultKind ?? "document";
  } else if (KNOWN_KINDS.has(kindRaw as RecordKind)) {
    kind = kindRaw as RecordKind;
  } else {
    kind = "document";
    errors.push({
      code: "RECORD_KIND_INVALID",
      messageFa: "نوع رکورد نامعتبر است",
      field: "record_kind",
    });
  }

  const date = normalizeDateField(f["date"]);
  if (date.failed) {
    errors.push({
      code: "DATE_INVALID",
      messageFa: "تاریخ قابل خواندن نیست (شمسی یا میلادی)",
      field: "date",
    });
  }

  let amount: string | null = null;
  let amountParseFailed = false;
  const amountRaw = (f["amount"] ?? "").trim();
  if (amountRaw !== "") {
    try {
      amount = parseAmount(amountRaw).toString();
    } catch {
      amountParseFailed = true;
      errors.push({
        code: "AMOUNT_INVALID",
        messageFa: "مبلغ باید عدد صحیح دقیق باشد",
        field: "amount",
      });
    }
  }

  const { currency } = resolveCurrency(f, opts.declaredCurrency ?? null);

  const normalized: NormalizedRecord = {
    kind,
    date: date.iso,
    dateParseFailed: date.failed,
    amount,
    amountParseFailed,
    currency,
    description: f["description"] || undefined,
    counterpartyName: f["counterparty"] || undefined,
    referenceNo: f["reference"] || undefined,
  };

  if (kind === "document") {
    const docType = (f["document_type"] ?? "").trim();
    if (docType !== "") {
      if (DOCUMENT_TYPES.has(docType)) normalized.documentType = docType;
      else
        errors.push({
          code: "DOCUMENT_TYPE_INVALID",
          messageFa: "نوع سند مجاز نیست",
          field: "document_type",
        });
    }
    normalized.documentNo = f["document_no"] || undefined;
  }

  if (kind === "journal_candidate") {
    normalized.memo = f["memo"] || f["description"] || undefined;
    const lines = record.lines ?? [];
    if (lines.length > 0) {
      normalized.lines = lines.map((l, i) =>
        normalizeLine(l, currency, errors, i),
      );
    }
  }

  return { normalized, errors };
}
