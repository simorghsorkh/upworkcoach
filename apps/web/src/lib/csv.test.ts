import { describe, expect, it } from 'vitest';
import { toCsv, toSafeCsvCell, UTF8_BOM } from './csv';

describe('toSafeCsvCell (SEC-V2, T-CSV)', () => {
  it('neutralises formula starts, including full-width forms and leading spaces', () => {
    for (const evil of [
      '=HYPERLINK("https://evil")',
      '+1',
      '-2+3',
      '@SUM(A1)',
      '\tx',
      '\rx',
      '＝1',
      '＋1',
      '－1',
      '＠x',
      '  =1',
    ]) {
      expect(toSafeCsvCell(evil).startsWith(`"'`)).toBe(true);
    }
  });

  it('quotes every cell and doubles inner quotes; numbers are not prefixed', () => {
    expect(toSafeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(toSafeCsvCell(-5)).toBe('"-5"');
    expect(toSafeCsvCell(null)).toBe('""');
    expect(toSafeCsvCell('علی')).toBe('"علی"');
  });

  it('toCsv: BOM, header, CRLF', () => {
    const csv = toCsv(['نام', 'موبایل'], [['علی', '09120000000']]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toBe(`${UTF8_BOM}"نام","موبایل"\r\n"علی","09120000000"\r\n`);
  });
});
