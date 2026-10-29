import { getLocale, getTimeZone } from 'next-intl/server';
import { createFormat, type Format } from '@/lib/format';
import { pickLocale } from './config';

/** `useFormat()` for server components: the request's language and time zone (ADR-0013). */
export async function getFormat(): Promise<Format> {
  const [locale, timeZone] = await Promise.all([getLocale(), getTimeZone()]);
  return createFormat(pickLocale(locale), timeZone);
}
