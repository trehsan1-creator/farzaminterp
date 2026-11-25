/**
 * Shared display formatters (single source per design system — never
 * hand-format dates/amounts per screen). Persian digits by default.
 */

import { formatAmount, type CurrencyCode, CURRENCY_LABELS } from "@/lib/money";
import { jalaliDisplayFromIso } from "@/lib/jalali";

export function displayDate(iso: string | null | undefined): string {
  return jalaliDisplayFromIso(iso, { digits: "fa" });
}

export function displayDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = jalaliDisplayFromIso(iso.slice(0, 10), { digits: "fa" });
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`.replace(/\d/g, (c) => "۰۱۲۳۴۵۶۷۸۹"[Number(c)] ?? c);
  return `${date} ساعت ${time}`;
}

export function displayMoney(
  amount: string | bigint | null | undefined,
  currency: string = "IRR",
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "bigint" ? amount : BigInt(amount);
  const unit = CURRENCY_LABELS[currency as CurrencyCode] ?? currency;
  return `${formatAmount(value, { digits: "fa" })} ${unit}`;
}

export function toFaDigits(input: string): string {
  return input.replace(/\d/g, (c) => "۰۱۲۳۴۵۶۷۸۹"[Number(c)] ?? c);
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

interface BadgeView {
  variant: BadgeVariant;
  label: string;
}

const BATCH_STATUS: Record<string, BadgeView> = {
  created: { variant: "neutral", label: "ایجاد شده" },
  running: { variant: "info", label: "در حال اجرا" },
  ready_to_post: { variant: "success", label: "آماده انتشار" },
  posting: { variant: "info", label: "در حال انتشار" },
  posted: { variant: "success", label: "انتشار یافته" },
  failed: { variant: "danger", label: "ناموفق" },
  cancelled: { variant: "neutral", label: "لغو شده" },
};

export function batchStatusBadge(status: string): BadgeView {
  return BATCH_STATUS[status] ?? { variant: "neutral", label: status };
}

const STAGE_LABELS: Record<string, string> = {
  source_registered: "ثبت فایل منبع",
  hash_verified: "تأیید اثر انگشت فایل",
  raw_preserved: "نگهداری نسخه خام",
  normalized: "نرمال‌سازی داده",
  validated: "اعتبارسنجی",
  duplicates_detected: "تشخیص تکراری‌ها",
  reconciled: "تطبیق",
  posting: "انتشار",
  posted: "انتشار یافته",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

const SEVERITY: Record<string, BadgeView> = {
  error: { variant: "danger", label: "خطا" },
  warning: { variant: "warning", label: "هشدار" },
  info: { variant: "info", label: "اطلاع" },
};

export function severityBadge(severity: string): BadgeView {
  return SEVERITY[severity] ?? { variant: "neutral", label: severity };
}

const DOC_STATUS: Record<string, BadgeView> = {
  registered: { variant: "neutral", label: "ثبت‌شده" },
  staged: { variant: "info", label: "در صف بررسی" },
  validated: { variant: "info", label: "معتبر" },
  on_hold: { variant: "warning", label: "در انتظار بررسی" },
  posted: { variant: "success", label: "انتشار یافته" },
  void: { variant: "neutral", label: "باطل" },
};

export function documentStatusBadge(status: string): BadgeView {
  return DOC_STATUS[status] ?? { variant: "neutral", label: status };
}

const DOC_TYPE: Record<string, string> = {
  journal: "سند دفتری",
  sales_invoice: "فاکتور فروش",
  purchase_invoice: "فاکتور خرید",
  bank_transaction: "تراکنش بانکی",
  tax_return: "اعلامیه مالیاتی",
  fixed_asset: "دارایی ثابت",
  other: "سایر",
};

export function documentTypeLabel(t: string): string {
  return DOC_TYPE[t] ?? t;
}

const RECORD_KIND: Record<string, string> = {
  document: "سند",
  bank_transaction: "تراکنش بانکی",
  sales_invoice: "فاکتور فروش",
  purchase_invoice: "فاکتور خرید",
  journal_candidate: "پیشنهاد سند دفتری",
  tax_return: "اعلامیه مالیاتی",
  fixed_asset: "دارایی ثابت",
};

export function recordKindLabel(k: string): string {
  return RECORD_KIND[k] ?? k;
}

const VALIDATION_STATUS: Record<string, BadgeView> = {
  pending: { variant: "neutral", label: "در انتظار" },
  valid: { variant: "success", label: "معتبر" },
  invalid: { variant: "danger", label: "نامعتبر" },
};

export function validationStatusBadge(s: string): BadgeView {
  return VALIDATION_STATUS[s] ?? { variant: "neutral", label: s };
}

const DUPLICATE_STATUS: Record<string, BadgeView> = {
  unknown: { variant: "neutral", label: "نامشخص" },
  unique: { variant: "success", label: "یکتا" },
  duplicate: { variant: "warning", label: "تکراری" },
};

export function duplicateStatusBadge(s: string): BadgeView {
  return DUPLICATE_STATUS[s] ?? { variant: "neutral", label: s };
}

const POST_STATUS: Record<string, BadgeView> = {
  pending: { variant: "neutral", label: "در انتظار" },
  posted: { variant: "success", label: "ثبت‌شده" },
  skipped: { variant: "warning", label: "رد شد" },
  failed: { variant: "danger", label: "ناموفق" },
};

export function postStatusBadge(s: string): BadgeView {
  return POST_STATUS[s] ?? { variant: "neutral", label: s };
}

/** Pipeline stage order for the review stepper. */
export const PIPELINE_STAGE_ORDER = [
  "source_registered",
  "hash_verified",
  "raw_preserved",
  "normalized",
  "validated",
  "duplicates_detected",
  "reconciled",
  "posting",
  "posted",
] as const;

export function stageProgressState(
  stage: string,
  status: string,
  currentStage: string,
): "done" | "current" | "failed" | "todo" {
  if (status === "failed" && stage === currentStage) return "failed";
  const curIdx = PIPELINE_STAGE_ORDER.indexOf(currentStage as never);
  const idx = PIPELINE_STAGE_ORDER.indexOf(stage as never);
  if (curIdx < 0 || idx < 0) return "todo";
  if (idx < curIdx) return "done";
  if (idx === curIdx) return status === "failed" ? "failed" : "current";
  return "todo";
}
