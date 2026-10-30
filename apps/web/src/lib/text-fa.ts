/**
 * Persian text normalisation (ADR-0008 section 3, security.md SEC-X5).
 * Pure functions: no I/O. Used before storing short Persian fields and before searching.
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const ZWNJ = '‌';

/** Persian (U+06F0..) and Arabic-Indic (U+0660..) digits → ASCII 0-9. Other characters untouched. */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const persian = PERSIAN_DIGITS.indexOf(ch);
    return String(persian >= 0 ? persian : ARABIC_DIGITS.indexOf(ch));
  });
}

/** Arabic Yeh/Alef Maksura → Persian Yeh, Arabic Kaf → Persian Keheh (step 1 of ADR-0008). */
export function unifyArabicLetters(input: string): string {
  return input
    .replace(/[يى]/g, 'ی') // ي ى → ی (Arabic yeh / alef maksura → Persian yeh)
    .replace(/ك/g, 'ک') // ك → ک (Arabic kaf → Persian keheh)
    .replace(/ۀ/g, 'هٔ'); // ۀ → هٔ (heh with yeh above → heh + hamza)
}

/**
 * Bidi control characters (LRE, RLE, PDF, LRO, RLO, LRI, RLI, FSI, PDI) are removed from
 * names, subjects, link titles and file names (SEC-X5). ZWNJ (U+200C) and ZWJ (U+200D) stay.
 */
export function stripBidiControls(input: string): string {
  return input.replace(/[‪-‮⁦-⁩]/g, '');
}

/** Arabic diacritics (harakat, tanween, shadda, sukun, superscript alef) and tatweel. */
function stripDiacriticsAndTatweel(input: string): string {
  return input.replace(/[ً-ٰٟـ]/g, '');
}

function collapseSpacing(input: string): string {
  return (
    input
      // Any run of ZWNJ → one ZWNJ.
      .replace(/‌{2,}/g, ZWNJ)
      // ZWNJ next to a space (either side) is meaningless → drop it.
      .replace(/[ \t]*‌[ \t]+|[ \t]+‌[ \t]*/g, ' ')
      // Runs of horizontal whitespace (incl. NBSP) → one space.
      .replace(/[ \t  -   　]+/g, ' ')
      .trim()
      // ZWNJ at the very start or end is meaningless too.
      .replace(/^‌+|‌+$/g, '')
  );
}

/**
 * Full normalisation for short Persian fields (names, tags, niche, question subject):
 * unify letters, strip diacritics and tatweel, collapse ZWNJ and spaces, trim, and remove
 * bidi controls. Digits are kept as typed (use {@link normalizeForSearch} for search text).
 */
export function normalizeFa(input: string): string {
  return collapseSpacing(stripDiacriticsAndTatweel(unifyArabicLetters(stripBidiControls(input))));
}

/**
 * Light normalisation for long free text (notes, feedback, messages): only letter
 * unification and trim. Line breaks and spacing are the author's (ADR-0008).
 */
export function normalizeFaLongText(input: string): string {
  return unifyArabicLetters(input).trim();
}

/** Search key: full normalisation + Latin digits + lower-case Latin letters (ADR-0008 step 5). */
export function normalizeForSearch(input: string): string {
  return toLatinDigits(normalizeFa(input)).toLowerCase();
}
