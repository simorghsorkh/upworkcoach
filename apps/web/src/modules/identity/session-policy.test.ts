import { describe, expect, it } from 'vitest';
import {
  absoluteExpiry,
  isRecentlyAuthenticated,
  isSessionValid,
  lastPasswordAt,
  REAUTH_WINDOW_MS,
  shouldTouch,
  slidingExpiry,
} from './session-policy';

const DAY = 24 * 3600 * 1000;
const t0 = new Date('2026-10-01T00:00:00Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);

describe('session lifetimes (SEC-S2)', () => {
  it('students: 30 days sliding, 90 days absolute', () => {
    expect(slidingExpiry('student', t0, t0)).toEqual(at(30));
    expect(slidingExpiry('student', t0, at(80))).toEqual(at(90));
    expect(absoluteExpiry('student', t0)).toEqual(at(90));
  });

  it('staff: 7 days sliding, 30 days absolute', () => {
    for (const role of ['admin', 'mentor'] as const) {
      expect(slidingExpiry(role, t0, t0)).toEqual(at(7));
      expect(slidingExpiry(role, t0, at(28))).toEqual(at(30));
    }
  });
});

describe('isSessionValid (SEC-S3)', () => {
  const base = {
    revokedAt: null,
    expiresAt: at(7),
    createdAt: t0,
    userStatus: 'active',
    userErasedAt: null,
    passwordChangedAt: t0,
  };

  it('accepts a fresh session', () => {
    expect(isSessionValid(base, 'mentor', at(1))).toBe(true);
  });

  it('rejects revoked, expired, inactive, erased and pre-password-change sessions', () => {
    expect(isSessionValid({ ...base, revokedAt: at(1) }, 'mentor', at(1))).toBe(false);
    expect(isSessionValid(base, 'mentor', at(7))).toBe(false);
    expect(isSessionValid({ ...base, userStatus: 'disabled' }, 'mentor', at(1))).toBe(false);
    expect(isSessionValid({ ...base, userStatus: 'invited' }, 'mentor', at(1))).toBe(false);
    expect(isSessionValid({ ...base, userErasedAt: at(1) }, 'mentor', at(1))).toBe(false);
    expect(isSessionValid({ ...base, passwordChangedAt: at(0.5) }, 'mentor', at(1))).toBe(false);
  });

  it('enforces the absolute cap even if expires_at was pushed further', () => {
    const tampered = { ...base, expiresAt: at(400) };
    expect(isSessionValid(tampered, 'mentor', at(29))).toBe(true);
    expect(isSessionValid(tampered, 'mentor', at(30))).toBe(false);
    expect(isSessionValid(tampered, 'student', at(89))).toBe(true);
    expect(isSessionValid(tampered, 'student', at(90))).toBe(false);
  });
});

describe('shouldTouch', () => {
  it('writes at most every 15 minutes', () => {
    expect(shouldTouch(null, t0)).toBe(true);
    expect(shouldTouch(t0, new Date(t0.getTime() + 14 * 60_000))).toBe(false);
    expect(shouldTouch(t0, new Date(t0.getTime() + 15 * 60_000))).toBe(true);
  });
});

describe('recent authentication for sensitive actions (SEC-S7, F-06)', () => {
  const MIN = 60_000;
  const ms = (minutes: number) => new Date(t0.getTime() + minutes * MIN);

  it('the sign-in itself counts for 30 minutes', () => {
    expect(REAUTH_WINDOW_MS).toBe(30 * MIN);
    expect(isRecentlyAuthenticated(t0, null, ms(30))).toBe(true);
    expect(isRecentlyAuthenticated(t0, null, ms(31))).toBe(false);
  });

  it('a later re-confirmation restarts the window; an older one is ignored', () => {
    expect(isRecentlyAuthenticated(t0, ms(100), ms(120))).toBe(true);
    expect(isRecentlyAuthenticated(t0, ms(100), ms(131))).toBe(false);
    expect(lastPasswordAt(ms(10), ms(5))).toEqual(ms(10));
    expect(lastPasswordAt(ms(10), ms(50))).toEqual(ms(50));
  });
});
