import { describe, expect, it } from 'vitest';
import { maskPhone, normalizeIranMobile, phonePasswordForms, toLocalMobile } from './phone';

describe('normalizeIranMobile', () => {
  const expected = '+989121234567';

  it.each([
    '09121234567',
    '9121234567',
    '+989121234567',
    '989121234567',
    '00989121234567',
    '+98 912 123 4567',
    '0912-123-4567',
    '(0912) 123 4567',
    '+98 0912 123 4567',
    '۰۹۱۲۱۲۳۴۵۶۷',
    '٠٩١٢١٢٣٤٥٦٧',
    '+۹۸۹۱۲۱۲۳۴۵۶۷',
    '۰۰۹۸۹۱۲۱۲۳۴۵۶۷',
    ' 0912 1234567 ',
  ])('normalises %s', (input) => {
    expect(normalizeIranMobile(input)).toBe(expected);
  });

  it.each([
    '',
    '0912123456', // too short
    '091212345678', // too long
    '02112345678', // landline
    '+19121234567', // other country
    '0912abc4567',
    '+98+9121234567',
    'x'.repeat(50),
  ])('rejects %s', (input) => {
    expect(normalizeIranMobile(input)).toBeNull();
  });
});

describe('toLocalMobile', () => {
  it('formats E.164 as 09…', () => {
    expect(toLocalMobile('+989121234567')).toBe('09121234567');
  });
});

describe('phonePasswordForms', () => {
  it('returns 0912… and 912… forms', () => {
    expect(phonePasswordForms('+989121234567')).toEqual(['09121234567', '9121234567']);
  });
});

describe('maskPhone (SEC-L3)', () => {
  it('keeps only the country code and the last four digits', () => {
    expect(maskPhone('+989121234567')).toBe('+98•••••4567');
  });

  it('fully masks anything that is not E.164', () => {
    expect(maskPhone('erased:abc')).toBe('•••');
    expect(maskPhone('09121234567')).toBe('•••');
  });

  it('never contains a full mobile number', () => {
    expect(maskPhone('+989121234567')).not.toMatch(/(\+98|0098|0)9\d{9}/);
  });
});
