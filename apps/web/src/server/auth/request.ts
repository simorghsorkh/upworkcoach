import type { AuthResult, RequestMeta } from '@/modules/identity/service';
import { assertRecentPassword, authenticateSession } from '@/modules/identity/service';
import { getClientIp } from '../http/client-ip';
import {
  getCookieConfig,
  parseCookieHeader,
  serializeCookie,
  serializeLocaleCookie,
} from './cookies';
import { type Actor, type MeDTO, toActor } from './current-user';

/**
 * Request-side session handling for Route Handlers (ADR-0003 section 5).
 * The session token is read ONLY from the session cookie (SEC-S6).
 */

export type RequestCookies = { sessionToken: string | null; deviceCookie: string | null };

export function readAuthCookies(req: Pick<Request, 'headers'>): RequestCookies {
  const config = getCookieConfig();
  const cookies = parseCookieHeader(req.headers.get('cookie'));
  return {
    sessionToken: cookies.get(config.sessionName) ?? null,
    deviceCookie: cookies.get(config.deviceName) ?? null,
  };
}

export function requestMeta(req: Pick<Request, 'headers'>): RequestMeta {
  const cookies = readAuthCookies(req);
  return {
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
    deviceCookie: cookies.deviceCookie,
    sessionToken: cookies.sessionToken,
  };
}

export type AuthenticatedRequest = {
  actor: Actor;
  user: MeDTO;
  sessionId: string;
  sessionToken: string;
  /** SEC-S7 (F-06): last password entry on this session (sign-in or `POST /auth/reauth`). */
  lastPasswordAt: Date;
};

export async function authenticateRequest(
  req: Pick<Request, 'headers'>,
): Promise<AuthenticatedRequest | null> {
  const { sessionToken } = readAuthCookies(req);
  if (!sessionToken) return null;
  const session = await authenticateSession(sessionToken, { touch: true });
  if (!session) return null;
  return {
    actor: toActor(session.user),
    user: session.user,
    sessionId: session.sessionId,
    sessionToken,
    lastPasswordAt: session.lastPasswordAt,
  };
}

/**
 * SEC-S7 (ADR-0003 section 8, followup F-06): sensitive admin actions — CSV exports, staff
 * invitations, role changes, `settings.access` — need a password entered on this session in
 * the last 30 minutes, else `403 REAUTH_REQUIRED` (the UI then calls `POST /auth/reauth`
 * and retries). Only applied to admins: other roles still get the service's plain 403.
 */
export function requireRecentPassword(auth: AuthenticatedRequest, now: Date = new Date()): void {
  if (auth.actor.role !== 'admin') return;
  assertRecentPassword(auth.lastPasswordAt, now);
}

const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 3600;

/** Set-Cookie values after login or token acceptance: new session + trusted-device cookie. */
export function authCookies(result: AuthResult, now: Date = new Date()): string[] {
  const config = getCookieConfig();
  const sessionMaxAge = (result.session.cookieExpiresAt.getTime() - now.getTime()) / 1000;
  return [
    serializeCookie(config.sessionName, result.session.token, {
      maxAgeSeconds: sessionMaxAge,
      secure: config.secure,
    }),
    serializeCookie(config.deviceName, result.deviceCookie, {
      maxAgeSeconds: DEVICE_COOKIE_MAX_AGE,
      secure: config.secure,
    }),
    serializeLocaleCookie(result.user.locale, config.secure),
  ];
}

/** Logout: the session cookie is cleared; the device cookie stays (ADR-0003 section 5). */
export function clearedSessionCookie(): string {
  const config = getCookieConfig();
  return serializeCookie(config.sessionName, '', { maxAgeSeconds: 0, secure: config.secure });
}
