import { toLatinDigits } from '@/components/format/fa';

/**
 * Client-side pre-check of a mobile number before it is sent to the API.
 * The server is the authority (src/lib/phone normalises to E.164, ADR-0008);
 * here we only convert Persian/Arabic digits and drop spaces so obvious typos
 * are caught without a round trip.
 */
export function cleanPhoneInput(raw: string): string {
  return toLatinDigits(raw).replace(/[\s‌\-().]/g, '');
}

/** Iranian mobile in any common form (09…, 9…, +989…, 989…, 00989…) or any E.164 number. */
export function looksLikePhone(cleaned: string): boolean {
  if (/^(?:\+|00)\d{10,15}$/.test(cleaned)) return true;
  return /^(?:98|0)?9\d{9}$/.test(cleaned);
}

export function phoneError(raw: string): string | null {
  const cleaned = cleanPhoneInput(raw);
  if (!cleaned) return 'شماره‌ی موبایلت را بنویس.';
  if (!looksLikePhone(cleaned))
    return 'این شماره‌ی موبایل درست به نظر نمی‌رسد؛ مثل ۰۹۱۲۳۴۵۶۷۸۹ بنویس.';
  return null;
}
