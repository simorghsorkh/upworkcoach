import { describe, expect, it } from 'vitest';
import { assertSafeAuditData } from './service';

describe('assertSafeAuditData (SEC-T8, SEC-L7)', () => {
  it('accepts plain metadata', () => {
    expect(() =>
      assertSafeAuditData({ role: 'mentor', creatorRole: 'admin', via: 'cli' }),
    ).not.toThrow();
  });

  it.each(['token', 'inviteUrl', 'resetUrl', 'password', 'tokenHash', 'link', 'cookie'])(
    'refuses %s',
    (key) => {
      expect(() => assertSafeAuditData({ [key]: 'x' })).toThrow();
    },
  );
});
