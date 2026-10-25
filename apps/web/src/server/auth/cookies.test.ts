import { describe, expect, it } from 'vitest';
import { cookieConfigFor, parseCookieHeader, serializeCookie } from './cookies';

describe('cookieConfigFor (SEC-S1, SEC-S8)', () => {
  it('uses __Host- names and Secure on https', () => {
    expect(cookieConfigFor('https://app.example.ir', '__Host-uc_session')).toEqual({
      sessionName: '__Host-uc_session',
      deviceName: '__Host-uc_dev',
      secure: true,
    });
  });

  it('drops the prefix and Secure on http://localhost', () => {
    expect(cookieConfigFor('http://localhost:3000', '__Host-uc_session')).toEqual({
      sessionName: 'uc_session',
      deviceName: 'uc_dev',
      secure: false,
    });
  });
});

describe('serializeCookie', () => {
  it('sets HttpOnly, SameSite=Lax, Path=/, Max-Age and no Domain', () => {
    const value = serializeCookie('__Host-uc_session', 'abc', {
      maxAgeSeconds: 60.7,
      secure: true,
    });
    expect(value).toBe('__Host-uc_session=abc; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure');
    expect(value.toLowerCase()).not.toContain('domain');
  });

  it('clears with Max-Age=0', () => {
    expect(serializeCookie('uc_session', '', { maxAgeSeconds: -5, secure: false })).toBe(
      'uc_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    );
  });
});

describe('parseCookieHeader', () => {
  it('parses names and keeps the first occurrence', () => {
    const map = parseCookieHeader('a=1; b=2; a=3; broken; =x');
    expect(map.get('a')).toBe('1');
    expect(map.get('b')).toBe('2');
    expect(map.size).toBe(2);
    expect(parseCookieHeader(null).size).toBe(0);
  });
});
