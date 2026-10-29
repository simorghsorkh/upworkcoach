import en from '../../messages/en.json';
import fa from '../../messages/fa.json';
import type { Locale } from './config';

/**
 * Message catalogs (ADR-0013 section 3). `fa.json` is the source of truth: every key there
 * must exist in `en.json` (messages.test.ts). Small enough to ship whole for now; split by
 * namespace when it grows.
 */
export type Messages = typeof fa;

const CATALOGS: Record<Locale, Messages> = { fa, en };

export function messagesFor(locale: Locale): Messages {
  return CATALOGS[locale];
}
