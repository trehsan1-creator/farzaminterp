/**
 * Exact monetary arithmetic for Rial/Toman amounts.
 *
 * Rules (AGENTS.md §4):
 *  - NEVER use JavaScript floating-point for money; this module uses BigInt
 *    end-to-end and serializes amounts as integer strings.
 *  - The currency unit is always explicit (IRR = Rial, IRT = Toman) and is
 *    never inferred from numeric magnitude.
 *  - Persistence layer uses PostgreSQL NUMERIC(20,0): |amount| < 10^20.
 */

export type CurrencyCode = "IRR" | "IRT";

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  IRR: "ریال",
  IRT: "تومان",
};

/** NUMERIC(20,0) signed range: -10^20 < x < 10^20 */
const MAX_ABS = 10n ** 20n;

export class MoneyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MoneyError";
    this.code = code;
  }
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value === "IRR" || value === "IRT";
}

export function assertCurrencyCode(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) {
    throw new MoneyError(
      "CURRENCY_UNKNOWN",
      `unsupported currency code: ${value} (only IRR and IRT are accepted, explicitly)`,
    );
  }
  return value;
}

/** Normalize Persian (۰-۹) and Arabic-Indic (٠-٩) digits to Latin digits. */
export function normalizeDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x06f0 && code <= 0x06f9) {
      out += String.fromCharCode(code - 0x06f0 + 0x30); // Persian
    } else if (code >= 0x0660 && code <= 0x0669) {
      out += String.fromCharCode(code - 0x0660 + 0x30); // Arabic-Indic
    } else {
      out += ch;
    }
  }
  return out;
}

const CURRENCY_WORD_PATTERNS: Array<{ re: RegExp; code: CurrencyCode }> = [
  { re: /ریال/i, code: "IRR" },
  { re: /تومان/i, code: "IRT" },
  { re: /\bIRR\b/i, code: "IRR" },
  { re: /\bIRT\b/i, code: "IRT" },
];

/**
 * Detect an EXPLICIT currency token inside a raw source string.
 * Returns null when the source states no unit — the caller must then use an
 * operator-declared currency or raise a validation error. Magnitude is never
 * used to guess the unit.
 */
export function detectExplicitCurrency(raw: string): CurrencyCode | null {
  for (const { re, code } of CURRENCY_WORD_PATTERNS) {
    if (re.test(raw)) return code;
  }
  return null;
}

/**
 * Parse a raw monetary string into an exact BigInt integer amount.
 * Accepts grouping separators (Latin comma, Persian thousands separator,
 * spaces) and localized digits. Rejects decimals (Rial scale is 0) and
 * anything non-integral — never rounds.
 */
export function parseAmount(raw: string): bigint {
  if (typeof raw !== "string") {
    throw new MoneyError("AMOUNT_TYPE", "amount must be a string");
  }
  let s = normalizeDigits(raw).trim();
  s = s.replace(/[,٬\s ]/g, "");
  s = s.replace(/(ریال|تومان|IRR|IRT)/gi, "").trim();
  if (s === "") {
    throw new MoneyError("AMOUNT_EMPTY", "amount is empty");
  }
  if (s.includes(".") || s.includes("٫")) {
    throw new MoneyError(
      "AMOUNT_NOT_INTEGER",
      "monetary amounts must be exact integers (Rial has no minor unit)",
    );
  }
  const neg = s.startsWith("-");
  const digits = neg ? s.slice(1) : s;
  if (!/^\d+$/.test(digits)) {
    throw new MoneyError("AMOUNT_INVALID", `invalid amount: ${raw}`);
  }
  const value = (neg ? -1n : 1n) * BigInt(digits);
  assertInRange(value);
  return value;
}

export function assertInRange(value: bigint): void {
  if (value >= MAX_ABS || value <= -MAX_ABS) {
    throw new MoneyError(
      "AMOUNT_OUT_OF_RANGE",
      "amount exceeds NUMERIC(20,0) range",
    );
  }
}

export function addMoney(a: bigint, b: bigint): bigint {
  const r = a + b;
  assertInRange(r);
  return r;
}

export function subMoney(a: bigint, b: bigint): bigint {
  const r = a - b;
  assertInRange(r);
  return r;
}

export function mulMoney(a: bigint, b: bigint): bigint {
  const r = a * b;
  assertInRange(r);
  return r;
}

export function negateMoney(a: bigint): bigint {
  const r = -a;
  assertInRange(r);
  return r;
}

export function compareMoney(a: bigint, b: bigint): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isZero(a: bigint): boolean {
  return a === 0n;
}

export interface FormatAmountOptions {
  /** Group thousands with separators (default true). */
  group?: boolean;
  /** Digit system for display: Persian by default in Persian workflows. */
  digits?: "fa" | "en";
}

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Format an exact integer amount for display without ever rounding. */
export function formatAmount(
  value: bigint,
  { group = true, digits = "fa" }: FormatAmountOptions = {},
): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  let s = abs.toString();
  if (group) {
    let out = "";
    let count = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      out = s[i] + out;
      count++;
      if (count % 3 === 0 && i > 0) out = "," + out;
    }
    s = out;
  }
  if (neg) s = "-" + s;
  if (digits === "fa") {
    s = s.replace(/,/g, "٬"); // Persian thousands separator
    s = s.replace(/\d/g, (d) => FA_DIGITS[Number(d)] ?? d);
  }
  return s;
}

/** Serialize for JSON/API/DB: signed integer string (exact). */
export function serializeAmount(value: bigint): string {
  return value.toString();
}

/** Parse an exact amount from a serialized integer string. */
export function deserializeAmount(raw: string): bigint {
  if (!/^-?\d+$/.test(raw)) {
    throw new MoneyError(
      "AMOUNT_SERIALIZED_INVALID",
      `serialized amount must be an integer string: ${raw}`,
    );
  }
  const value = BigInt(raw);
  assertInRange(value);
  return value;
}
