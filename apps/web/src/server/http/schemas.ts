import { z } from 'zod';
import { normalizeFa, normalizeFaLongText, toLatinDigits } from '@/lib/text-fa';
import { isUuid } from '@/lib/uuid';

/**
 * Shared zod building blocks for API inputs (api.md section 1, security.md SEC-X2, ADR-0008).
 * Messages are Persian; values are never echoed back (SEC-L4).
 */

export const HTTPS_URL_MESSAGE = 'آدرس کامل را با https بنویس.';

/**
 * SEC-X2: every URL field is checked with `new URL()` — `https:` only, no username or
 * password, at most 2048 characters. The value is stored as typed (trimmed); the system never
 * opens it.
 */
export const httpsUrl = z
  .string()
  .max(2048, 'آدرس حداکثر ۲۰۴۸ نویسه می‌تواند باشد.')
  .transform((value, ctx) => {
    const trimmed = value.trim();
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      ctx.addIssue({ code: 'custom', message: HTTPS_URL_MESSAGE });
      return z.NEVER;
    }
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || !url.hostname) {
      ctx.addIssue({ code: 'custom', message: HTTPS_URL_MESSAGE });
      return z.NEVER;
    }
    return trimmed;
  });

/** UUID path/body id. */
export const uuidInput = z.string().refine(isUuid, { message: 'مقدار نامعتبر است' });

/**
 * Short single-line Persian/English text (names, headlines, niche, …): full normalisation
 * (ADR-0008, SEC-X5). An empty result becomes `null` (clears the field).
 */
export function shortText(max: number) {
  return z
    .string()
    .max(max * 4)
    .transform((value) => normalizeFa(value))
    .pipe(z.string().max(max, `حداکثر ${max.toLocaleString('fa-IR')} نویسه مجاز است.`))
    .transform((value) => (value === '' ? null : value));
}

/** Short text that must not be empty. */
export function requiredShortText(max: number, emptyMessage = 'این فیلد را پر کن.') {
  return z
    .string()
    .max(max * 4)
    .transform((value) => normalizeFa(value))
    .pipe(
      z
        .string()
        .min(1, emptyMessage)
        .max(max, `حداکثر ${max.toLocaleString('fa-IR')} نویسه مجاز است.`),
    );
}

/** Multi-line free text: light normalisation only (line breaks are the author's). */
export function longText(max: number) {
  return z
    .string()
    .max(max * 2)
    .transform((value) => normalizeFaLongText(value))
    .pipe(z.string().max(max, `حداکثر ${max.toLocaleString('fa-IR')} نویسه مجاز است.`))
    .transform((value) => (value === '' ? null : value));
}

/** Integer from a number or a string with Persian/Arabic/Latin digits (api.md section 1). */
export function intInput(min: number, max: number) {
  return z.union([z.number(), z.string().max(20)]).transform((value, ctx) => {
    const n = typeof value === 'number' ? value : Number(toLatinDigits(value.trim()));
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: 'مقدار نامعتبر است' });
      return z.NEVER;
    }
    return n;
  });
}

/** Non-negative decimal with at most 2 fractional digits, returned as a string (numeric). */
export const moneyInput = z.union([z.number(), z.string().max(20)]).transform((value, ctx) => {
  const text = typeof value === 'number' ? String(value) : toLatinDigits(value.trim());
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    ctx.addIssue({ code: 'custom', message: 'مقدار نامعتبر است' });
    return z.NEVER;
  }
  return text;
});

/** Calendar day `YYYY-MM-DD` (Gregorian, meaning a Tehran day; api.md section 1). */
export const dayInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ نامعتبر است')
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }, 'تاریخ نامعتبر است');

/** Query-string boolean (`1`/`0`/`true`/`false`). */
export const queryFlag = z
  .enum(['1', '0', 'true', 'false'])
  .transform((value) => value === '1' || value === 'true');

/** Tags: normalised, de-duplicated, at most 20 of at most 40 characters each. */
export const tagsInput = z
  .array(z.string().max(160))
  .max(20, 'حداکثر ۲۰ برچسب مجاز است.')
  .transform((values, ctx) => {
    const out: string[] = [];
    for (const raw of values) {
      const tag = normalizeFa(raw);
      if (tag === '') continue;
      if (tag.length > 40) {
        ctx.addIssue({ code: 'custom', message: 'هر برچسب حداکثر ۴۰ نویسه می‌تواند باشد.' });
        return z.NEVER;
      }
      if (!out.includes(tag)) out.push(tag);
    }
    return out;
  });

/** Opaque list cursor (api.md section 1). */
export const cursorInput = z.string().max(200);

export const limitInput = intInput(1, 100);

/** Encodes an offset as the opaque cursor. Lists are small (≤ 500 students, overview 6). */
export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url');
}

/** Decodes an opaque cursor; anything malformed → 422. */
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { o?: unknown };
    if (typeof parsed.o === 'number' && Number.isInteger(parsed.o) && parsed.o >= 0) {
      return parsed.o;
    }
  } catch {
    // fall through
  }
  return -1;
}

/** Multi-line free text that must not be empty (light normalisation, ADR-0008). */
export function requiredLongText(max: number, emptyMessage = 'این فیلد را پر کن.') {
  return z
    .string()
    .max(max * 2)
    .transform((value) => normalizeFaLongText(value))
    .pipe(z.string().max(max, `حداکثر ${max.toLocaleString('fa-IR')} نویسه مجاز است.`))
    .refine((value) => value !== '', { message: emptyMessage });
}

/**
 * English text pasted from Upwork (job post, proposal, profile): stored exactly as typed
 * except trimming (ADR-0008: English text is not normalised). Empty → null.
 */
export function englishText(max: number) {
  return z
    .string()
    .max(max * 2)
    .transform((value) => value.trim())
    .pipe(z.string().max(max, `حداکثر ${max.toLocaleString('fa-IR')} نویسه مجاز است.`))
    .transform((value) => (value === '' ? null : value));
}

/** ISO 8601 instant (with an offset or `Z`); returned as a Date. */
export const isoInstantInput = z
  .string()
  .max(40)
  .refine((value) => /T/.test(value) && !Number.isNaN(Date.parse(value)), {
    message: 'زمان نامعتبر است',
  })
  .transform((value) => new Date(value));
