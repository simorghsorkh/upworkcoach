import { describe, expect, it } from 'vitest';
import {
  generateToken,
  looksLikeToken,
  sha256Hex,
  signDeviceCookie,
  verifyDeviceCookie,
} from './tokens';

const SECRET = 'test-device-secret-0123456789abcdef';
const USER = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

describe('tokens', () => {
  it('generates 32-byte base64url tokens', () => {
    const token = generateToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(looksLikeToken(token)).toBe(true);
    expect(generateToken()).not.toBe(token);
  });

  it('stores only a SHA-256 hex digest', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('rejects malformed tokens early', () => {
    expect(looksLikeToken('')).toBe(false);
    expect(looksLikeToken('a'.repeat(42))).toBe(false);
    expect(looksLikeToken(`${'a'.repeat(42)}/`)).toBe(false);
  });
});

describe('device cookie (SEC-R2)', () => {
  it('round-trips the user id', () => {
    expect(verifyDeviceCookie(signDeviceCookie(USER, SECRET), SECRET)).toBe(USER);
  });

  it('rejects another secret, tampering and garbage', () => {
    const value = signDeviceCookie(USER, SECRET);
    expect(verifyDeviceCookie(value, `${SECRET}x`)).toBeNull();
    const other = signDeviceCookie('0192a3b4-0000-7000-8000-000000000000', SECRET);
    const forged = `${value.split('.')[0]}.${other.split('.')[1]}`;
    expect(verifyDeviceCookie(forged, SECRET)).toBeNull();
    expect(verifyDeviceCookie('garbage', SECRET)).toBeNull();
    expect(verifyDeviceCookie('', SECRET)).toBeNull();
    expect(verifyDeviceCookie(null, SECRET)).toBeNull();
  });
});
