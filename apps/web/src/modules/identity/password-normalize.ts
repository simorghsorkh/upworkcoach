/**
 * SEC-P1 — applied identically before hashing and before verifying. Changing it later
 * would invalidate every stored hash.
 * 1. NFKC  2. Persian/Arabic digits → ASCII  3. Arabic yeh/alef maksura ي/ى → Persian yeh ی,
 *    Arabic kaf ك → Persian keheh ک
 * 4. no trim, no case change
 *
 * Kept in its own dependency-free module so the blocklist generator
 * (`scripts/build-common-passwords.ts`) normalises entries with exactly the same function.
 */
export function normalizePassword(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک');
}

/** Key of the blocklist (SEC-P3): normalised, then lower-cased. */
export function blocklistKey(raw: string): string {
  return normalizePassword(raw).toLowerCase();
}
