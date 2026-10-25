import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, base64url (ADR-0003 section 1, SEC-T2). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex — the only form of a token stored in the database. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Rejects obviously malformed tokens before touching the database. */
export function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * Trusted-device cookie (ADR-0003 section 4, SEC-R2):
 * `base64url(userId) + '.' + base64url(HMAC-SHA256(DEVICE_COOKIE_SECRET, userId))`.
 * It only lets the owner bypass the global per-phone lock; it is not an authenticator.
 */
export function signDeviceCookie(userId: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(userId, 'utf8').digest('base64url');
  return `${Buffer.from(userId, 'utf8').toString('base64url')}.${mac}`;
}

/** Returns the userId when the HMAC is valid (constant-time compare), else null. */
export function verifyDeviceCookie(
  value: string | undefined | null,
  secret: string,
): string | null {
  if (!value || value.length > 200) return null;
  const [encodedId, mac] = value.split('.');
  if (!encodedId || !mac) return null;
  const userId = Buffer.from(encodedId, 'base64url').toString('utf8');
  const expected = createHmac('sha256', secret).update(userId, 'utf8').digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? userId : null;
}
