import { describe, expect, it } from "vitest";
import {
  formatGregorianIso,
  formatJalali,
  isValidJalali,
  jalaliDisplayFromIso,
  jalaliMonthLength,
  jalaliStringToIso,
  parseIsoDate,
  parseJalaliDate,
  toGregorian,
  toJalali,
} from "@/lib/jalali";

describe("jalali — known anchors", () => {
  it("1404-01-01 = 2025-03-21 (FY1404 start)", () => {
    expect(toJalali({ year: 2025, month: 3, day: 21 })).toEqual({
      jy: 1404,
      jm: 1,
      jd: 1,
    });
    expect(toGregorian({ jy: 1404, jm: 1, jd: 1 })).toEqual({
      year: 2025,
      month: 3,
      day: 21,
    });
  });

  it("1404 ends on 2026-03-20 (non-leap year)", () => {
    expect(toJalali({ year: 2026, month: 3, day: 20 })).toEqual({
      jy: 1404,
      jm: 12,
      jd: 29,
    });
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(isValidJalali({ jy: 1404, jm: 12, jd: 30 })).toBe(false);
  });

  it("1403 is a leap year (Esfand 30 exists)", () => {
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(isValidJalali({ jy: 1403, jm: 12, jd: 30 })).toBe(true);
    expect(toJalali({ year: 2025, month: 3, day: 20 })).toEqual({
      jy: 1403,
      jm: 12,
      jd: 30,
    });
  });

  it("matches every month boundary of 1404", () => {
    const boundaries: Array<[string, number, number]> = [
      ["2025-03-21", 1, 1],
      ["2025-04-21", 2, 1],
      ["2025-05-22", 3, 1],
      ["2025-06-22", 4, 1],
      ["2025-07-23", 5, 1],
      ["2025-08-23", 6, 1],
      ["2025-09-23", 7, 1],
      ["2025-10-23", 8, 1],
      ["2025-11-22", 9, 1],
      ["2025-12-22", 10, 1],
      ["2026-01-21", 11, 1],
      ["2026-02-20", 12, 1],
      ["2026-03-20", 12, 29],
    ];
    for (const [iso, jm, jd] of boundaries) {
      const g = parseIsoDate(iso)!;
      expect(toJalali(g)).toEqual({ jy: 1404, jm, jd });
    }
  });
});

describe("jalali — round-trips", () => {
  it("round-trips every day from 2020-01-01 to 2030-12-31", () => {
    const start = Date.UTC(2020, 0, 1);
    const end = Date.UTC(2030, 11, 31);
    for (let t = start; t <= end; t += 86400000) {
      const d = new Date(t);
      const g = {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      };
      const back = toGregorian(toJalali(g));
      expect(back).toEqual(g);
    }
  });
});

describe("jalali — parsing and display", () => {
  it("parses localized Jalali strings to canonical ISO", () => {
    expect(jalaliStringToIso("۱۴۰۴/۰۱/۰۱")).toBe("2025-03-21");
    expect(jalaliStringToIso("1404/12/29")).toBe("2026-03-20");
    expect(jalaliStringToIso("not a date")).toBeNull();
  });

  it("formats with Persian digits by default", () => {
    expect(formatJalali({ jy: 1404, jm: 1, jd: 1 })).toBe("۱۴۰۴/۰۱/۰۱");
    expect(formatJalali({ jy: 1404, jm: 1, jd: 1 }, { digits: "en" })).toBe("1404/01/01");
    expect(jalaliDisplayFromIso("2025-03-21")).toBe("۱۴۰۴/۰۱/۰۱");
    expect(jalaliDisplayFromIso(null)).toBe("—");
    expect(jalaliDisplayFromIso("garbage")).toBe("—");
  });

  it("validates ISO and Jalali inputs", () => {
    expect(parseIsoDate("2025-02-30")).toBeNull();
    expect(parseIsoDate("2024-02-29")).not.toBeNull();
    expect(parseJalaliDate("1404/13/01")).toBeNull();
    expect(parseJalaliDate("1404/01/32")).toBeNull();
    expect(formatGregorianIso({ year: 2025, month: 3, day: 21 })).toBe("2025-03-21");
  });
});
