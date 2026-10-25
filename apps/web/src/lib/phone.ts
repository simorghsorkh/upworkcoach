import { toLatinDigits } from './text-fa';

/**
 * Iranian mobile numbers (ADR-0003 section 4, security.md SEC-R7 / SEC-L3).
 *
 * Accepted input forms (Persian, Arabic or Latin digits; spaces, dashes, dots and
 * parentheses ignored): `09121234567`, `9121234567`, `+989121234567`, `989121234567`,
 * `00989121234567`. Output: E.164 `+989121234567`.
 *
 * Assumption (sprint-1 notes): 0.1 only accepts Iranian mobiles (`9` + 9 digits after the
 * country code). The `users.phone` CHECK already allows any E.164 number for later.
 */
const IRAN_MOBILE_NATIONAL = /^9\d{9}$/;

/** Returns the E.164 form, or null when the input is not an Iranian mobile number. */
export function normalizeIranMobile(input: string): string | null {
  if (typeof input !== 'string' || input.length > 40) return null;
  let s = toLatinDigits(input.normalize('NFKC')).replace(/[\s\-.()‌‎‏]/g, '');

  if (s.startsWith('+98')) s = s.slice(3);
  else if (s.startsWith('0098')) s = s.slice(4);
  else if (s.startsWith('98') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0')) s = s.slice(1);

  // The national number may still carry a leading zero after the country code: +98 0912…
  if (s.length === 11 && s.startsWith('09')) s = s.slice(1);

  return IRAN_MOBILE_NATIONAL.test(s) ? `+98${s}` : null;
}

/** `+989121234567` → `09121234567` (display, CSV). */
export function toLocalMobile(e164: string): string {
  return e164.startsWith('+98') ? `0${e164.slice(3)}` : e164;
}

/**
 * Forms that must not appear inside a password (SEC-P3): `09121234567` and `9121234567`.
 */
export function phonePasswordForms(e164: string): string[] {
  if (!e164.startsWith('+98')) return [e164.replace(/^\+/, '')];
  const national = e164.slice(3);
  return [`0${national}`, national];
}

/** `+989121234567` → `+98•••••4567` (logs only; SEC-L3). Non-phones are fully masked. */
export function maskPhone(phone: string): string {
  const match = /^\+(\d{2})\d*(\d{4})$/.exec(phone);
  if (!match) return '•••';
  return `+${match[1]}•••••${match[2]}`;
}
