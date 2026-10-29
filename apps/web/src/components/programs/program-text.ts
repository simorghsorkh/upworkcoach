/** Pure helpers of the program screens (usable from server and client components). */
import { toLatinDigits } from '@/components/format/fa';

/** A calendar day `YYYY-MM-DD` as an instant inside that day in Iran (for `Format`). */
export function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

/**
 * Wraps user text placed inside a message (FSI … PDI), so a Persian title inside an English
 * sentence, or the reverse, keeps its own direction and the punctuation around it.
 */
export function isolate(text: string): string {
  return `\u2068${text}\u2069`;
}

/** Optional number field value (Persian or Latin digits): '' ↔ null. */
export function numberOrNull(value: string): number | null {
  const n = Number.parseInt(toLatinDigits(value.trim()), 10);
  return Number.isFinite(n) ? n : null;
}
