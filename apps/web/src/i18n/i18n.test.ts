import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errors } from '@/server/http/errors';
import { parseOrThrow } from '@/server/http/validation';
import { directionOf, localeFromAcceptLanguage, pickLocale } from './config';
import { messagesFor } from './messages';
import { formatCount, localizeText, translate } from './translate';

function keysOf(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix];
  return Object.entries(node).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(text: string): string[] {
  // Argument names only: `{name}` or `{name, …}` — not the branches of a plural.
  return [...new Set([...text.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1] ?? ''))].sort();
}

describe('message catalogs (ADR-0013 section 3)', () => {
  const fa = messagesFor('fa');
  const en = messagesFor('en');

  it('fa and en have exactly the same keys', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(fa).sort());
  });

  it('every message uses the same placeholders in both languages', () => {
    for (const key of keysOf(fa)) {
      const read = (root: unknown) =>
        key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], root);
      expect(placeholders(String(read(en))), key).toEqual(placeholders(String(read(fa))));
    }
  });

  it('no message is empty', () => {
    for (const locale of ['fa', 'en'] as const) {
      for (const key of keysOf(messagesFor(locale))) {
        expect(translate(locale, key).trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });
});

describe('locale resolution', () => {
  it('picks the first supported candidate, else fa', () => {
    expect(pickLocale(null, 'en', 'fa')).toBe('en');
    expect(pickLocale('de', undefined)).toBe('fa');
  });

  it('reads Accept-Language by quality', () => {
    expect(localeFromAcceptLanguage('en-US,en;q=0.9')).toBe('en');
    expect(localeFromAcceptLanguage('fa')).toBe('fa');
    expect(localeFromAcceptLanguage('de-DE,en;q=0.5,fa;q=0.8')).toBe('fa');
    expect(localeFromAcceptLanguage(null)).toBe('fa');
  });

  it('direction follows the language', () => {
    expect(directionOf('fa')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });
});

describe('translate and localizeText', () => {
  it('formats counts with the digits of the language', () => {
    expect(formatCount('fa', 12)).toBe('۱۲');
    expect(formatCount('en', 12)).toBe('12');
  });

  it('maps a Persian catalog text to its English twin', () => {
    expect(localizeText('en', 'پیدا نشد.')).toBe('Not found.');
    expect(localizeText('fa', 'پیدا نشد.')).toBe('پیدا نشد.');
  });

  it('leaves text outside the catalog unchanged', () => {
    expect(localizeText('en', 'متنی که هنوز در کاتالوگ نیست')).toBe('متنی که هنوز در کاتالوگ نیست');
  });
});

describe('API errors in the request language', () => {
  it('keeps the Persian body byte-identical by default', () => {
    expect(errors.notFound().toBody()).toEqual({
      error: { code: 'NOT_FOUND', message: 'پیدا نشد.' },
    });
    expect(errors.tooManyAttempts(125).toBody().error.message).toBe(
      'تلاش‌ها زیاد بود؛ ۳ دقیقه‌ی دیگر دوباره امتحان کن.',
    );
  });

  it('translates code messages, parameters and fields to English', () => {
    expect(errors.forbidden().toBody('en').error.message).toBe(
      'You do not have access to this section.',
    );
    expect(errors.tooManyAttempts(125).toBody('en').error.message).toBe(
      'Too many attempts; try again in 3 minutes.',
    );
    expect(errors.phoneTaken().toBody('en').error.fields).toEqual({
      phone: 'This mobile number is already registered.',
    });
  });

  it('translates validation fields', () => {
    const schema = z.strictObject({ name: z.string().min(3).max(5), age: z.number() });
    let caught: unknown;
    try {
      parseOrThrow(schema, { name: 'ab', extra: 1 });
    } catch (err) {
      caught = err;
    }
    const fa = (caught as ReturnType<typeof errors.notFound>).toBody('fa').error.fields;
    const en = (caught as ReturnType<typeof errors.notFound>).toBody('en').error.fields;
    expect(fa).toEqual({
      name: 'حداقل ۳ نویسه لازم است.',
      age: 'این فیلد را پر کن.',
      extra: 'فیلد ناشناخته',
    });
    expect(en).toEqual({
      name: 'At least 3 characters are needed.',
      age: 'Fill in this field.',
      extra: 'Unknown field',
    });
  });
});
