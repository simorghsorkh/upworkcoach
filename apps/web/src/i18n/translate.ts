import { createTranslator } from 'next-intl';
import type { Locale } from './config';
import { type Messages, messagesFor } from './messages';

/**
 * Translation outside React (API errors, validation). Pure; works in route handlers, jobs
 * and tests. Components use `useTranslations` / `getTranslations` instead.
 */
type Params = Record<string, string | number>;

const translators = new Map<Locale, (key: string, params?: Params) => string>();

export function translate(locale: Locale, key: string, params?: Params): string {
  let t = translators.get(locale);
  if (!t) {
    const base = createTranslator({ locale, messages: messagesFor(locale) });
    t = (k, p) => (base as unknown as (k: string, p?: Params) => string)(k, p);
    translators.set(locale, t);
  }
  return t(key, params);
}

/** Numbers inside messages: Persian digits for fa (same as `toLocaleString('fa-IR')`). */
export function formatCount(locale: Locale, value: number): string {
  return value.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US');
}

/**
 * Persian text → its catalog key, for every parameter-free string in `fa.json`. Lets the API
 * translate messages that services still throw as Persian literals (ADR-0013 section 6:
 * text moves into the catalog gradually); an unknown text is returned unchanged.
 */
let reverse: Map<string, string> | null = null;

function reverseIndex(): Map<string, string> {
  if (reverse) return reverse;
  const map = new Map<string, string>();
  const walk = (node: unknown, path: string[]) => {
    if (typeof node === 'string') {
      if (!node.includes('{') && !map.has(node)) map.set(node, path.join('.'));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) walk(child, [...path, key]);
    }
  };
  walk(messagesFor('fa') satisfies Messages, []);
  reverse = map;
  return map;
}

export function localizeText(locale: Locale, text: string): string {
  if (locale === 'fa') return text;
  const key = reverseIndex().get(text);
  return key ? translate(locale, key) : text;
}
