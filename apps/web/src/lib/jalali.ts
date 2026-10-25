import { toLatinDigits } from './text-fa';

/**
 * Jalali (Solar Hijri) ↔ Gregorian conversion of calendar days (ADR-0008). Pure; works in
 * the browser too. The API itself never takes or returns Jalali dates — this exists for the
 * documented exceptions: Jalali deadlines in an imported CSV file and the default Jalali
 * month of the North Star dashboard. Algorithm: the 2820-year-free "breaks" table of
 * jalaali-js (Borkowski), valid for Jalali years -61 … 3177.
 */

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
  2456, 3178,
];

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const last = BREAKS[BREAKS.length - 1] ?? 3178;
  let jp = BREAKS[0] ?? -61;
  if (jy < jp || jy >= last) throw new Error(`invalid Jalali year: ${jy}`);
  const gy = jy + 621;
  let leapJ = -14;
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i] ?? last;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const { gy } = d2g(jdn);
  let jy = gy - 621;
  const r = jalCal(jy);
  const first = g2d(gy, 3, r.march);
  let k = jdn - first;
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function isJalaliLeapYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Gregorian `YYYY-MM-DD` of a Jalali day; null when the Jalali day does not exist. */
export function jalaliToGregorian(jy: number, jm: number, jd: number): string | null {
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return null;
  if (jy < 1 || jy > 3000 || jm < 1 || jm > 12 || jd < 1) return null;
  if (jd > jalaliMonthLength(jy, jm)) return null;
  const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
  return `${pad(gy, 4)}-${pad(gm)}-${pad(gd)}`;
}

/** Jalali parts of a Gregorian `YYYY-MM-DD` day. */
export function gregorianToJalali(day: string): { jy: number; jm: number; jd: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`invalid day: ${day}`);
  return d2j(g2d(Number(match[1]), Number(match[2]), Number(match[3])));
}

/**
 * Parses a day typed by a person in either calendar: `1405/08/01`, `۱۴۰۵-۰۸-۰۱`,
 * `2026-10-23`, `2026/10/23`. Years below 1700 are Jalali. Returns the Gregorian
 * `YYYY-MM-DD` (meaning a Tehran day), or null when it is not a real day.
 */
export function parseAnyCalendarDay(input: string): string | null {
  const text = toLatinDigits(input.trim());
  const match = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(text);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1700) return jalaliToGregorian(y, m, d);
  const iso = `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

/** First and last Gregorian day of the Jalali month that contains `day`. */
export function jalaliMonthRange(day: string): { from: string; to: string } {
  const { jy, jm } = gregorianToJalali(day);
  const from = jalaliToGregorian(jy, jm, 1);
  const to = jalaliToGregorian(jy, jm, jalaliMonthLength(jy, jm));
  if (!from || !to) throw new Error(`invalid Jalali month of ${day}`);
  return { from, to };
}
