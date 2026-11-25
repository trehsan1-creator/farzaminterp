import { describe, expect, it } from "vitest";
import {
  addMoney,
  assertCurrencyCode,
  compareMoney,
  deserializeAmount,
  detectExplicitCurrency,
  formatAmount,
  MoneyError,
  mulMoney,
  normalizeDigits,
  parseAmount,
  serializeAmount,
  subMoney,
} from "@/lib/money";

describe("money — exact integer arithmetic (never float)", () => {
  it("parses plain integer strings", () => {
    expect(parseAmount("4200000000")).toBe(4200000000n);
    expect(parseAmount("-1500")).toBe(-1500n);
  });

  it("normalizes Persian and Arabic-Indic digits", () => {
    expect(normalizeDigits("۱۲۳۴")).toBe("1234");
    expect(normalizeDigits("٤٥٦")).toBe("456");
    expect(parseAmount("۴٬۲۰۰٬۰۰۰")).toBe(4200000n);
  });

  it("strips grouping separators and explicit unit words", () => {
    expect(parseAmount("1,250,000 ریال")).toBe(1250000n);
    expect(parseAmount("25,000 تومان")).toBe(25000n);
  });

  it("rejects decimals instead of rounding", () => {
    expect(() => parseAmount("10.5")).toThrowError(MoneyError);
    try {
      parseAmount("10.5");
    } catch (e) {
      expect((e as MoneyError).code).toBe("AMOUNT_NOT_INTEGER");
    }
    expect(() => parseAmount("10٫5")).toThrowError(MoneyError);
  });

  it("rejects garbage", () => {
    expect(() => parseAmount("")).toThrowError(MoneyError);
    expect(() => parseAmount("abc")).toThrowError(MoneyError);
    expect(() => parseAmount("12x3")).toThrowError(MoneyError);
  });

  it("stays exact beyond IEEE-754 safe integers", () => {
    // 2^53 + 1 cannot be represented exactly as a JS number
    const big = parseAmount("9007199254740993");
    expect(big).toBe(9007199254740993n);
    expect(addMoney(big, 1n)).toBe(9007199254740994n);
    // the float path would collapse this
    expect(Number(big) + 1).not.toBe(9007199254740994);
  });

  it("adds, subtracts and multiplies exactly", () => {
    expect(addMoney(999999999999999999n, 1n)).toBe(1000000000000000000n);
    expect(subMoney(1000n, 2500n)).toBe(-1500n);
    expect(mulMoney(123456789n, 100n)).toBe(12345678900n);
    expect(compareMoney(1n, 2n)).toBe(-1);
    expect(compareMoney(2n, 2n)).toBe(0);
    expect(compareMoney(3n, 2n)).toBe(1);
  });

  it("enforces the NUMERIC(20,0) range", () => {
    expect(() => addMoney(10n ** 20n, 0n)).toThrowError(MoneyError);
    expect(() => parseAmount("1".repeat(21))).toThrowError(MoneyError);
  });

  it("formats with grouping and Persian digits without rounding", () => {
    expect(formatAmount(4200000000n)).toBe("۴٬۲۰۰٬۰۰۰٬۰۰۰");
    expect(formatAmount(4200000000n, { digits: "en" })).toBe("4,200,000,000");
    expect(formatAmount(-1500n)).toBe("-۱٬۵۰۰");
    expect(formatAmount(0n)).toBe("۰");
  });

  it("serializes as integer strings for JSON/DB", () => {
    const raw = serializeAmount(4200000000n);
    expect(raw).toBe("4200000000");
    expect(deserializeAmount(raw)).toBe(4200000000n);
    expect(() => deserializeAmount("1.5")).toThrowError(MoneyError);
    expect(() => deserializeAmount("1e9")).toThrowError(MoneyError);
  });
});

describe("money — explicit currency, never inferred", () => {
  it("detects only explicitly stated units", () => {
    expect(detectExplicitCurrency("12,000 ریال")).toBe("IRR");
    expect(detectExplicitCurrency("12000 تومان")).toBe("IRT");
    expect(detectExplicitCurrency("5000 IRR")).toBe("IRR");
    // magnitude must never imply a unit
    expect(detectExplicitCurrency("12000")).toBeNull();
    expect(detectExplicitCurrency("12000000000")).toBeNull();
  });

  it("accepts only IRR and IRT codes", () => {
    expect(assertCurrencyCode("IRR")).toBe("IRR");
    expect(assertCurrencyCode("IRT")).toBe("IRT");
    expect(() => assertCurrencyCode("USD")).toThrowError(MoneyError);
    expect(() => assertCurrencyCode("rial")).toThrowError(MoneyError);
  });
});
