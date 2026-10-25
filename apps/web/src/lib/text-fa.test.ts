import { describe, expect, it } from 'vitest';
import {
  normalizeFa,
  normalizeFaLongText,
  normalizeForSearch,
  stripBidiControls,
  toLatinDigits,
  unifyArabicLetters,
} from './text-fa';

describe('toLatinDigits', () => {
  it('converts Persian and Arabic-Indic digits', () => {
    expect(toLatinDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(toLatinDigits('کد ۱۲ و ٣٤ و 56')).toBe('کد 12 و 34 و 56');
  });
});

describe('unifyArabicLetters', () => {
  it('maps Arabic yeh, alef maksura and kaf to Persian letters', () => {
    expect(unifyArabicLetters('علي')).toBe('علی');
    expect(unifyArabicLetters('مصطفى')).toBe('مصطفی');
    expect(unifyArabicLetters('كامران')).toBe('کامران');
  });

  it('decomposes heh with yeh above', () => {
    expect(unifyArabicLetters('خانۀ')).toBe('خانهٔ');
  });
});

describe('normalizeFa', () => {
  it('unifies letters, trims and collapses spaces', () => {
    expect(normalizeFa('  علي   رضايي  ')).toBe('علی رضایی');
  });

  it('removes diacritics and tatweel', () => {
    expect(normalizeFa('مُحَمَّد')).toBe('محمد');
    expect(normalizeFa('ســلام')).toBe('سلام');
  });

  it('collapses repeated ZWNJ and drops ZWNJ next to spaces', () => {
    expect(normalizeFa('می‌‌خواهم')).toBe('می‌خواهم');
    expect(normalizeFa('کتاب ‌ها')).toBe('کتاب ها');
    expect(normalizeFa('‌سلام‌')).toBe('سلام');
  });

  it('keeps a single ZWNJ inside a word', () => {
    expect(normalizeFa('نیم‌فاصله')).toBe('نیم‌فاصله');
  });

  it('removes bidi control characters (SEC-X5)', () => {
    expect(normalizeFa('abc‮def⁦x⁩')).toBe('abcdefx');
  });

  it('keeps digits as typed', () => {
    expect(normalizeFa('دوره ۱۲')).toBe('دوره ۱۲');
  });
});

describe('stripBidiControls', () => {
  it('keeps ZWNJ and ZWJ', () => {
    expect(stripBidiControls('a‌b‍c‪d')).toBe('a‌b‍cd');
  });
});

describe('normalizeFaLongText', () => {
  it('only unifies letters and trims; line breaks stay', () => {
    expect(normalizeFaLongText('  سلام علي\n\nخوبي؟  ')).toBe('سلام علی\n\nخوبی؟');
  });
});

describe('normalizeForSearch', () => {
  it('produces the same key for Arabic and Persian spellings and digits', () => {
    expect(normalizeForSearch('علي ۰۹۱۲')).toBe(normalizeForSearch('علی 0912'));
  });

  it('lower-cases Latin letters', () => {
    expect(normalizeForSearch('Upwork  PRO')).toBe('upwork pro');
  });
});
