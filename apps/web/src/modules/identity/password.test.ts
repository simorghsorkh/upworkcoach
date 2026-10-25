import { hash } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';
import {
  ARGON2_OPTIONS,
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  normalizePassword,
  verifyPassword,
} from './password';

const PHONE = '+989121234567';

describe('normalizePassword (SEC-P1)', () => {
  it('maps Persian/Arabic digits and Arabic letters to one form', () => {
    expect(normalizePassword('Abc۱۲۳يك')).toBe(normalizePassword('Abc123یک'));
    expect(normalizePassword('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizePassword('مصطفى')).toBe('مصطفی');
  });

  it('does not trim and does not change case', () => {
    expect(normalizePassword(' abc')).not.toBe(normalizePassword('abc'));
    expect(normalizePassword('ABC')).toBe('ABC');
  });

  it('applies NFKC (full-width → ASCII)', () => {
    expect(normalizePassword('ＡＢＣ１')).toBe('ABC1');
  });
});

describe('checkPasswordPolicy (SEC-P2, SEC-P3)', () => {
  it('requires 8 characters for students and 12 for staff', () => {
    expect(checkPasswordPolicy('kh8-ab-cd', { role: 'student', phone: PHONE })).toBeNull();
    expect(checkPasswordPolicy('kh7abcd', { role: 'student', phone: PHONE })).toMatch(/۸/);
    expect(checkPasswordPolicy('river-stone-9', { role: 'mentor', phone: PHONE })).toBeNull();
    expect(checkPasswordPolicy('river-stone', { role: 'admin', phone: PHONE })).toMatch(/۱۲/);
  });

  it('measures length after normalisation, in characters (not bytes)', () => {
    expect(checkPasswordPolicy('رودخانه‌سنگ', { role: 'student', phone: PHONE })).toBeNull();
  });

  it('caps length at 128 characters', () => {
    expect(checkPasswordPolicy('a'.repeat(128), { role: 'student', phone: PHONE })).toBeNull();
    expect(checkPasswordPolicy('a'.repeat(129), { role: 'student', phone: PHONE })).toMatch(/۱۲۸/);
  });

  it('rejects common passwords case-insensitively, also typed with Persian digits', () => {
    expect(checkPasswordPolicy('Password123', { role: 'student', phone: PHONE })).toMatch(/رایج/);
    expect(checkPasswordPolicy('۱۲۳۴۵۶۷۸', { role: 'student', phone: PHONE })).toMatch(/رایج/);
  });

  it('rejects passwords that contain the phone in either form', () => {
    expect(checkPasswordPolicy('me09121234567', { role: 'student', phone: PHONE })).toMatch(
      /موبایل/,
    );
    expect(checkPasswordPolicy('x9121234567x', { role: 'student', phone: PHONE })).toMatch(
      /موبایل/,
    );
    expect(checkPasswordPolicy('۰۹۱۲۱۲۳۴۵۶۷!', { role: 'student', phone: PHONE })).toMatch(
      /موبایل/,
    );
  });
});

describe('argon2id hashing (SEC-P4)', () => {
  it('produces a PHC string with the configured parameters', async () => {
    const h = await hashPassword('correct horse');
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(needsRehash(h)).toBe(false);
  });

  it('verifies the normalised form (Persian digits typed on another keyboard)', async () => {
    const h = await hashPassword('رمز۱۲۳ي');
    expect(await verifyPassword(h, 'رمز123ی')).toBe(true);
    expect(await verifyPassword(h, 'رمز124ی')).toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('flags hashes made with other parameters for rehash', async () => {
    const weaker = await hash('x', { ...ARGON2_OPTIONS, timeCost: 1 });
    expect(needsRehash(weaker)).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });
});
