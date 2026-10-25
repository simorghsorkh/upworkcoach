/**
 * CSV output (security.md SEC-V2, api.md section 13). Pure; unit-tested.
 *
 * - Every cell is quoted and inner quotes doubled.
 * - Formula injection: a string cell that (after trimming) starts with `=`, `+`, `-`, `@`,
 *   Tab, CR, or their full-width forms gets a leading `'` so Excel shows it as text.
 * - UTF-8 with BOM and CRLF line ends, so Excel opens Persian text correctly.
 */
const DANGEROUS_START = /^[=+\-@\t\r＝＋－＠]/;

export function toSafeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (
    typeof value === 'string' &&
    (DANGEROUS_START.test(text) || DANGEROUS_START.test(text.trimStart()))
  ) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export const UTF8_BOM = '﻿';

export function toCsv(
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>,
): string {
  const lines = [header, ...rows].map((row) => row.map(toSafeCsvCell).join(','));
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
