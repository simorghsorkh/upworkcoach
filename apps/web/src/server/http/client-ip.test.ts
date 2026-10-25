import { describe, expect, it } from 'vitest';
import { cleanIp, ipForThrottle, resolveClientIp, UNKNOWN_IP } from './client-ip';

const h = (xff?: string) => new Headers(xff === undefined ? {} : { 'x-forwarded-for': xff });

describe('resolveClientIp (SEC-R4)', () => {
  it('ignores X-Forwarded-For when no proxy is trusted', () => {
    expect(resolveClientIp(h('1.2.3.4'), 0).ip).toBe(UNKNOWN_IP);
    expect(resolveClientIp(h('1.2.3.4'), 0, '10.0.0.5').ip).toBe('10.0.0.5');
  });

  it('flags X-Forwarded-For that arrives while no proxy is trusted (F-18)', () => {
    expect(resolveClientIp(h('1.2.3.4'), 0).warning).toBe('xff_ignored');
    expect(resolveClientIp(h(), 0).warning).toBeUndefined();
  });

  it('takes the right-most value with one trusted proxy', () => {
    expect(resolveClientIp(h('6.6.6.6, 1.2.3.4'), 1).ip).toBe('1.2.3.4');
  });

  it('never reads spoofed values on the left', () => {
    expect(resolveClientIp(h('9.9.9.9, 8.8.8.8, 1.2.3.4'), 1).ip).toBe('1.2.3.4');
    expect(resolveClientIp(h('9.9.9.9, 8.8.8.8, 1.2.3.4'), 2).ip).toBe('8.8.8.8');
  });

  it('falls back and warns when the header has fewer values than trusted hops', () => {
    const result = resolveClientIp(h('1.2.3.4'), 2);
    expect(result).toEqual({ ip: UNKNOWN_IP, warning: 'xff_too_short' });
    expect(resolveClientIp(h(), 1).warning).toBe('xff_too_short');
  });

  it('strips ports', () => {
    expect(resolveClientIp(h('1.2.3.4:5678'), 1).ip).toBe('1.2.3.4');
    expect(resolveClientIp(h('[2001:db8::1]:443'), 1).ip).toBe('2001:db8::1');
  });

  it('returns unknown for garbage', () => {
    expect(resolveClientIp(h('not-an-ip'), 1).ip).toBe(UNKNOWN_IP);
  });
});

describe('cleanIp', () => {
  it('maps IPv4-mapped IPv6 to IPv4', () => {
    expect(cleanIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
  });

  it('lower-cases IPv6', () => {
    expect(cleanIp('2001:DB8::1')).toBe('2001:db8::1');
  });
});

describe('ipForThrottle', () => {
  it('keeps IPv4 as is', () => {
    expect(ipForThrottle('1.2.3.4')).toBe('1.2.3.4');
  });

  it('reduces IPv6 to its /64 prefix', () => {
    expect(ipForThrottle('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:0db8:0001:0002::/64');
    expect(ipForThrottle('2001:db8:1:2::1')).toBe('2001:0db8:0001:0002::/64');
    expect(ipForThrottle('2001:db8::1')).toBe('2001:0db8:0000:0000::/64');
    expect(ipForThrottle('::1')).toBe('0000:0000:0000:0000::/64');
  });

  it('puts two addresses of the same /64 in one bucket', () => {
    expect(ipForThrottle('2001:db8:1:2::1')).toBe(ipForThrottle('2001:db8:1:2:ffff::9'));
  });
});
