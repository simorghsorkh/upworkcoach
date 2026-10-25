import type { Role } from '@/server/auth/current-user';

/**
 * Session lifetimes (ADR-0003 section 5, security.md SEC-S2) — pure, unit-tested.
 *
 * | role            | sliding | absolute cap from created_at |
 * | student         | 30 days | 90 days                      |
 * | admin / mentor  |  7 days | 30 days                      |
 */
const DAY = 24 * 3600 * 1000;

export const SESSION_LIFETIME = {
  student: { slidingMs: 30 * DAY, absoluteMs: 90 * DAY },
  staff: { slidingMs: 7 * DAY, absoluteMs: 30 * DAY },
} as const;

/** last_used_at / expires_at / last_seen_at are written at most every 15 minutes. */
export const SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export function lifetimeFor(role: Role) {
  return role === 'student' ? SESSION_LIFETIME.student : SESSION_LIFETIME.staff;
}

export function absoluteExpiry(role: Role, createdAt: Date): Date {
  return new Date(createdAt.getTime() + lifetimeFor(role).absoluteMs);
}

/** Sliding expiry, never past the absolute cap. */
export function slidingExpiry(role: Role, createdAt: Date, now: Date): Date {
  const sliding = now.getTime() + lifetimeFor(role).slidingMs;
  return new Date(Math.min(sliding, absoluteExpiry(role, createdAt).getTime()));
}

export type SessionCheck = {
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  userStatus: string;
  userErasedAt: Date | null;
  passwordChangedAt: Date | null;
};

/** SEC-S3: checked on every request (API and RSC). */
export function isSessionValid(s: SessionCheck, role: Role, now: Date): boolean {
  if (s.revokedAt !== null) return false;
  if (s.expiresAt.getTime() <= now.getTime()) return false;
  if (absoluteExpiry(role, s.createdAt).getTime() <= now.getTime()) return false;
  if (s.userStatus !== 'active' || s.userErasedAt !== null) return false;
  if (s.passwordChangedAt !== null && s.createdAt.getTime() < s.passwordChangedAt.getTime()) {
    return false;
  }
  return true;
}

export function shouldTouch(lastUsedAt: Date | null, now: Date): boolean {
  return lastUsedAt === null || now.getTime() - lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}

/**
 * SEC-S7 (ADR-0003 section 8, followup F-06): sensitive admin actions (CSV exports, inviting
 * staff, changing a role, `settings.access`) need a password entered on this session within
 * the last 30 minutes — at sign-in (`created_at`; also after change-password, which rotates
 * the session) or with `POST /auth/reauth` (`reauth_at`).
 */
export const REAUTH_WINDOW_MS = 30 * 60 * 1000;

export function lastPasswordAt(createdAt: Date, reauthAt: Date | null): Date {
  return reauthAt && reauthAt.getTime() > createdAt.getTime() ? reauthAt : createdAt;
}

export function isRecentlyAuthenticated(
  createdAt: Date,
  reauthAt: Date | null,
  now: Date,
): boolean {
  return now.getTime() - lastPasswordAt(createdAt, reauthAt).getTime() <= REAUTH_WINDOW_MS;
}
