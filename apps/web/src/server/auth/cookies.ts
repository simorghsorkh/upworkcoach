import { getEnv } from '../env';

/**
 * Cookie names and attributes (ADR-0003 section 5, security.md SEC-S1, SEC-S8, SEC-R2).
 *
 * Production (https APP_BASE_URL): `__Host-uc_session` / `__Host-uc_dev`, Secure, HttpOnly,
 * SameSite=Lax, Path=/, no Domain.
 * Local (http APP_BASE_URL): the `__Host-` prefix and `Secure` are dropped (`uc_session`,
 * `uc_dev`), because browsers refuse `__Host-` cookies without Secure on plain http.
 */
export type CookieConfig = {
  sessionName: string;
  deviceName: string;
  secure: boolean;
};

export function cookieConfigFor(appBaseUrl: string, sessionCookieName: string): CookieConfig {
  const secure = new URL(appBaseUrl).protocol === 'https:';
  const strip = (name: string) => (secure ? name : name.replace(/^__(Host|Secure)-/, ''));
  return {
    sessionName: strip(sessionCookieName),
    deviceName: strip('__Host-uc_dev'),
    secure,
  };
}

export function getCookieConfig(): CookieConfig {
  const env = getEnv();
  return cookieConfigFor(env.APP_BASE_URL, env.SESSION_COOKIE_NAME);
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAgeSeconds: number; secure: boolean },
): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Minimal Cookie header parser. Only the first occurrence of a name counts. */
export function parseCookieHeader(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name && !map.has(name)) map.set(name, value);
  }
  return map;
}
