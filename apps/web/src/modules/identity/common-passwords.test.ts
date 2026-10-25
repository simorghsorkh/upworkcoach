import { describe, expect, it } from 'vitest';
import { COMMON_PASSWORDS_SOURCE, getCommonPasswords, isCommonPassword } from './common-passwords';
import { checkPasswordPolicy } from './password';

const PHONE = '+989121234567';

describe('password blocklist (SEC-P3, F-04)', () => {
  it('holds about 100k entries from the pinned SecLists source, plus the local list', () => {
    expect(COMMON_PASSWORDS_SOURCE.entries).toBe(100_000);
    expect(COMMON_PASSWORDS_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(COMMON_PASSWORDS_SOURCE.licence).toMatch(/^MIT/);
    expect(getCommonPasswords().size).toBeGreaterThanOrEqual(100_000);
  });

  it('keeps only entries the length rule would not refuse anyway (8+ characters)', () => {
    for (const entry of getCommonPasswords()) expect([...entry].length).toBeGreaterThanOrEqual(8);
  });

  it('matches after normalisation and case folding', () => {
    expect(isCommonPassword('password123')).toBe(true);
    expect(isCommonPassword('PassWord123')).toBe(true);
    expect(isCommonPassword('۱۲۳۴۵۶۷۸')).toBe(true); // Persian digits → 12345678
    expect(isCommonPassword('iloveyou2')).toBe(true); // from the corpus, not the local list
    expect(isCommonPassword('perspolis1')).toBe(true); // local Iran-specific list
    expect(isCommonPassword('river-stone-9')).toBe(false);
  });

  it('the policy refuses a leaked password with the Persian, non-judgemental message', () => {
    expect(checkPasswordPolicy('superman123', { role: 'student', phone: PHONE })).toMatch(/رایج/);
    expect(checkPasswordPolicy('kh8-ab-cd', { role: 'student', phone: PHONE })).toBeNull();
  });
});
