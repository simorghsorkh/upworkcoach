/**
 * Languages of the interface (ADR-0013). No `@/` imports: drizzle-kit loads this file
 * through the identity schema.
 *
 * Order of choice: the user's preference → the organization's default → Persian. The URL
 * never carries the language (the app is behind sign-in and has no SEO).
 */
export const SUPPORTED_LOCALES = ['fa', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fa';

/**
 * Remembers the last chosen language for signed-out pages (sign-in, invite). Not a session
 * secret; read only to pick the language.
 */
export const LOCALE_COOKIE = 'uc_locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** The first supported value, else Persian. */
export function pickLocale(...candidates: unknown[]): Locale {
  for (const candidate of candidates) if (isLocale(candidate)) return candidate;
  return DEFAULT_LOCALE;
}

export function directionOf(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'fa' ? 'rtl' : 'ltr';
}

/**
 * Language of an API request: the client sends its page language as `Accept-Language`
 * (components/api/client.ts). Only the primary tag of the first entry counts.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const first = header?.split(',')[0]?.trim().split(';')[0]?.split('-')[0]?.toLowerCase();
  return pickLocale(first);
}
