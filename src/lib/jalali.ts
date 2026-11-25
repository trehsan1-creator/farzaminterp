/**
 * Jalali (Shamsi/Hijri-Shamsi) date conversion and formatting.
 *
 * Storage/API dates are canonical Gregorian ISO dates; Jalali is a display
 * concern (design-system/RTL_AND_LOCALE.md). One shared adapter — never
 * hand-format dates per screen.
 *
 * Algorithm: calendar arithmetic of the Persian calendar (proleptic
 * Jalali), verified against known anchors in tests/jalali.test.ts
 * (e.g. 1404-01-01 = 2025-03-21; 1404-12-29 = 2026-03-20; 1403 is leap).
 */

export interface GregorianDate {
  year: number;
  month: number; // 1..12
  day: number;
}

export interface JalaliDate {
  jy: number;
  jm: number; // 1..12
  jd: number;
}

const div = (a: number, b: number): number => Math.trunc(a / b);
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b;

/** Gregorian -> Julian Day Number (integer, valid for y >= 0). */
export function gregorianToJdn(g: GregorianDate): number {
  const { year: gy, month: gm, day: gd } = g;
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** Julian Day Number -> Gregorian date. */
export function jdnToGregorian(jdn: number): GregorianDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { year: gy, month: gm, day: gd };
}

/** Leap-year info for a Jalali year (march day length determines Esfand 30). */
function jalCalLeap(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
    2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0] as number;
  let jump = 0;
  let n = 0;
  if (jy < jp || jy >= (breaks[bl - 1] as number)) {
    throw new Error(`invalid Jalali year: ${jy}`);
  }
  for (let idx = 1; idx < bl; idx += 1) {
    const jm = breaks[idx] as number;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG =
    div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  // leap-day flag (same arithmetic as the reference Persian calendar
  // algorithm); used by the day -> Jalali branch near Nowruz.
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

export function jalaliToJdn(j: JalaliDate): number {
  const { jy, jm, jd } = j;
  const r = jalCalLeap(jy);
  const g = gregorianToJdn({ year: r.gy, month: 3, day: r.march });
  return (
    g + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
  );
}

export function jdnToJalali(jdn: number): JalaliDate {
  const { year: gy } = jdnToGregorian(jdn);
  let jy = gy - 621;
  const r = jalCalLeap(jy);
  const jdn1f = gregorianToJdn({ year: r.gy, month: 3, day: r.march });
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31);
      const jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  const jm = 7 + div(k, 30);
  const jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function toJalali(g: GregorianDate): JalaliDate {
  return jdnToJalali(gregorianToJdn(g));
}

export function toGregorian(j: JalaliDate): GregorianDate {
  return jdnToGregorian(jalaliToJdn(j));
}

/**
 * Days in a Jalali month. Esfand length (29/30) is derived from the tested
 * conversion itself: the last day before the next Nowruz is Esfand's last
 * day — never from an ambiguous leap flag.
 */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  if (jy + 1 > 3177 || jy + 1 < -61) return 29; // outside supported conversion range
  const nextNowruzJdn = jalaliToJdn({ jy: jy + 1, jm: 1, jd: 1 });
  const last = jdnToJalali(nextNowruzJdn - 1);
  return last.jd;
}

export function isValidJalali(j: JalaliDate): boolean {
  if (j.jm < 1 || j.jm > 12 || j.jd < 1) return false;
  return j.jd <= jalaliMonthLength(j.jy, j.jm);
}

export function isValidGregorian(g: GregorianDate): boolean {
  if (g.month < 1 || g.month > 12 || g.day < 1) return false;
  const len = new Date(
    Date.UTC(g.year, g.month, 0),
  ).getUTCDate();
  return g.day <= len;
}

/** Parse canonical ISO date string (YYYY-MM-DD). */
export function parseIsoDate(iso: string): GregorianDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const g = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  };
  return isValidGregorian(g) ? g : null;
}

/** Parse Jalali date string (YYYY/M/D with localized digits tolerated). */
export function parseJalaliDate(raw: string): JalaliDate | null {
  const s = normalizeDigitsLocal(raw.trim());
  const m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(s);
  if (!m) return null;
  const j = { jy: Number(m[1]), jm: Number(m[2]), jd: Number(m[3]) };
  return isValidJalali(j) ? j : null;
}

function normalizeDigitsLocal(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x06f0 && code <= 0x06f9) {
      out += String.fromCharCode(code - 0x06f0 + 0x30);
    } else if (code >= 0x0660 && code <= 0x0669) {
      out += String.fromCharCode(code - 0x0660 + 0x30);
    } else out += ch;
  }
  return out;
}

export function formatGregorianIso(g: GregorianDate): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(g.year, 4)}-${p(g.month)}-${p(g.day)}`;
}

export function formatJalali(
  j: JalaliDate,
  opts: { digits?: "fa" | "en"; separator?: string } = {},
): string {
  const { digits = "fa", separator = "/" } = opts;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  let s = `${p(j.jy, 4)}${separator}${p(j.jm)}${separator}${p(j.jd)}`;
  if (digits === "fa") {
    s = s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)] ?? d);
  }
  return s;
}

/** Display helper: ISO storage string -> Jalali display string. */
export function jalaliDisplayFromIso(
  iso: string | null | undefined,
  opts: { digits?: "fa" | "en" } = {},
): string {
  if (!iso) return "—";
  const g = parseIsoDate(iso);
  if (!g) return "—";
  return formatJalali(toJalali(g), opts);
}

/** Convert a source Jalali date string to canonical ISO for storage. */
export function jalaliStringToIso(raw: string): string | null {
  const j = parseJalaliDate(raw);
  if (!j) return null;
  return formatGregorianIso(toGregorian(j));
}

/**
 * Canonical storage date -> ISO string for a Date (UTC midnight anchor).
 * Application code stores/reads dates as ISO strings, not Date objects.
 */
export function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
