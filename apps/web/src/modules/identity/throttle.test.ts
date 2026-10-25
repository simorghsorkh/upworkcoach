import { describe, expect, it } from 'vitest';
import {
  applyFailure,
  lockRemainingSeconds,
  THROTTLE_RULES,
  type ThrottleRule,
  type ThrottleState,
  throttleKeys,
} from './throttle';

const t0 = new Date('2026-10-20T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);
const MIN = 60_000;

function failTimes(
  n: number,
  rule: ThrottleRule = THROTTLE_RULES.loginPhoneIp,
  step = 1000,
): ThrottleState {
  let state: ThrottleState | null = null;
  for (let i = 0; i < n; i += 1) state = applyFailure(state, at(i * step), rule);
  if (!state) throw new Error('no state');
  return state;
}

describe('applyFailure (lock rules, ADR-0003 section 4)', () => {
  it('locks phone+IP exactly at the 5th failure for 15 minutes', () => {
    const four = failTimes(4);
    expect(four.lockedUntil).toBeNull();
    expect(lockRemainingSeconds(four, at(4000))).toBe(0);

    const five = failTimes(5);
    expect(five.failures).toBe(5);
    expect(five.lockedUntil?.getTime()).toBe(at(4000).getTime() + 15 * MIN);
    expect(lockRemainingSeconds(five, at(4000))).toBe(15 * 60);
  });

  it('locks the global phone key at the 20th failure for 1 hour', () => {
    expect(failTimes(19, THROTTLE_RULES.loginPhone).lockedUntil).toBeNull();
    const twenty = failTimes(20, THROTTLE_RULES.loginPhone);
    expect(lockRemainingSeconds(twenty, at(19_000))).toBe(60 * 60);
  });

  it('locks the IP key at the 30th failure', () => {
    expect(failTimes(29, THROTTLE_RULES.loginIp).lockedUntil).toBeNull();
    expect(failTimes(30, THROTTLE_RULES.loginIp).lockedUntil).not.toBeNull();
  });

  it('starts a new window when the old one is over', () => {
    const four = failTimes(4);
    const later = applyFailure(four, at(16 * MIN), THROTTLE_RULES.loginPhoneIp);
    expect(later).toEqual({ failures: 1, windowStartedAt: at(16 * MIN), lockedUntil: null });
  });

  it('restarts counting after a lock has expired', () => {
    const locked = failTimes(5);
    const after = applyFailure(locked, at(31 * MIN), THROTTLE_RULES.loginPhoneIp);
    expect(after.failures).toBe(1);
    expect(after.lockedUntil).toBeNull();
  });

  it('is not locked once lockedUntil has passed', () => {
    const locked = failTimes(5);
    expect(lockRemainingSeconds(locked, at(15 * MIN + 4000))).toBe(0);
    expect(lockRemainingSeconds(null, t0)).toBe(0);
  });
});

describe('throttleKeys (SEC-R3, SEC-R7)', () => {
  it('uses the E.164 phone and the /64 of IPv6', () => {
    expect(throttleKeys.loginPhoneIp('+989121234567', '1.2.3.4')).toBe(
      'login:pi:+989121234567:1.2.3.4',
    );
    expect(throttleKeys.loginIp('2001:db8:1:2::5')).toBe('login:ip:2001:0db8:0001:0002::/64');
    expect(throttleKeys.loginPhone('+989121234567')).toBe('login:p:+989121234567');
    expect(throttleKeys.tokenIp('1.2.3.4')).toBe('token:ip:1.2.3.4');
  });
});
