import { inArray, like, or, sql } from 'drizzle-orm';
import type { Db } from '@/server/db';
import { ipForThrottle } from '@/server/http/client-ip';
import { authThrottle } from './schema';

/**
 * Three-layer login lockout and token rate limiting (ADR-0003 section 4, data-model.md
 * `auth_throttle`, security.md SEC-R1..R7). Shared by all instances through Postgres.
 */
export type ThrottleRule = {
  threshold: number;
  windowMs: number;
  lockMs: number;
};

const MIN = 60_000;

export const THROTTLE_RULES = {
  /** SEC-R1 — nobody bypasses it. */
  loginPhoneIp: { threshold: 5, windowMs: 15 * MIN, lockMs: 15 * MIN },
  /** SEC-R2 — a valid device cookie of the same user bypasses it. */
  loginPhone: { threshold: 20, windowMs: 60 * MIN, lockMs: 60 * MIN },
  /** SEC-R3 */
  loginIp: { threshold: 30, windowMs: 15 * MIN, lockMs: 15 * MIN },
  /** SEC-R3 — failed `tokens/lookup` and `tokens/accept`. */
  tokenIp: { threshold: 30, windowMs: 15 * MIN, lockMs: 15 * MIN },
  /** change-password with a wrong current password. */
  passwordChange: { threshold: 5, windowMs: 15 * MIN, lockMs: 15 * MIN },
} as const satisfies Record<string, ThrottleRule>;

/** Keys always use the E.164 phone (SEC-R7) and the /64-reduced IP (SEC-R3). */
export const throttleKeys = {
  loginPhoneIp: (phone: string, ip: string) => `login:pi:${phone}:${ipForThrottle(ip)}`,
  loginPhone: (phone: string) => `login:p:${phone}`,
  loginIp: (ip: string) => `login:ip:${ipForThrottle(ip)}`,
  tokenIp: (ip: string) => `token:ip:${ipForThrottle(ip)}`,
  passwordChange: (userId: string) => `pwchange:u:${userId}`,
};

export type ThrottleState = {
  failures: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
};

/** Seconds until the lock ends (0 = not locked). */
export function lockRemainingSeconds(state: ThrottleState | null | undefined, now: Date): number {
  if (!state?.lockedUntil) return 0;
  const ms = state.lockedUntil.getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** Pure state transition for one failed attempt. */
export function applyFailure(
  state: ThrottleState | null | undefined,
  now: Date,
  rule: ThrottleRule,
): ThrottleState {
  const expired =
    !state ||
    now.getTime() - state.windowStartedAt.getTime() >= rule.windowMs ||
    (state.lockedUntil !== null && state.lockedUntil.getTime() <= now.getTime());

  const failures = expired ? 1 : state.failures + 1;
  const windowStartedAt = expired ? now : state.windowStartedAt;
  const stillLocked = !expired && state.lockedUntil !== null ? state.lockedUntil : null;
  const lockedUntil =
    failures >= rule.threshold ? new Date(now.getTime() + rule.lockMs) : stillLocked;
  return { failures, windowStartedAt, lockedUntil };
}

type DbLike = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'transaction' | 'execute'>;

export async function readThrottleStates(
  db: DbLike,
  keys: string[],
): Promise<Map<string, ThrottleState>> {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({
      key: authThrottle.key,
      failures: authThrottle.failures,
      windowStartedAt: authThrottle.windowStartedAt,
      lockedUntil: authThrottle.lockedUntil,
    })
    .from(authThrottle)
    .where(inArray(authThrottle.key, keys));
  return new Map(rows.map((row) => [row.key, row]));
}

/**
 * Atomic across instances (SEC-R5): `INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE`
 * + update, inside one transaction. The row lock serialises concurrent failures on a key.
 */
export async function registerFailure(
  db: DbLike,
  key: string,
  rule: ThrottleRule,
  now: Date = new Date(),
): Promise<ThrottleState> {
  return db.transaction(async (tx) => {
    await tx
      .insert(authThrottle)
      .values({ key, failures: 0, windowStartedAt: now, lockedUntil: null })
      .onConflictDoNothing({ target: authThrottle.key });
    const [current] = await tx
      .select({
        failures: authThrottle.failures,
        windowStartedAt: authThrottle.windowStartedAt,
        lockedUntil: authThrottle.lockedUntil,
      })
      .from(authThrottle)
      .where(sql`${authThrottle.key} = ${key}`)
      .for('update');
    const next = applyFailure(current, now, rule);
    await tx.update(authThrottle).set(next).where(sql`${authThrottle.key} = ${key}`);
    return next;
  });
}

export async function clearThrottleKeys(db: DbLike, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await db.delete(authThrottle).where(inArray(authThrottle.key, keys));
}

/** Every key that contains this phone (CLI reset, erasure). */
export async function clearThrottleForPhone(db: DbLike, phone: string): Promise<void> {
  await db
    .delete(authThrottle)
    .where(
      or(
        sql`${authThrottle.key} = ${throttleKeys.loginPhone(phone)}`,
        like(authThrottle.key, `login:pi:${phone}:%`),
      ),
    );
}

/** auth.cleanup: rows whose window and lock are both over (data-model.md 6-1). */
export async function deleteStaleThrottleRows(db: DbLike, now: Date = new Date()): Promise<number> {
  const longestWindowMs = Math.max(...Object.values(THROTTLE_RULES).map((r) => r.windowMs));
  const cutoff = new Date(now.getTime() - longestWindowMs);
  const result = await db
    .delete(authThrottle)
    .where(
      sql`${authThrottle.windowStartedAt} < ${cutoff} AND (${authThrottle.lockedUntil} IS NULL OR ${authThrottle.lockedUntil} < ${now})`,
    );
  return result.rowCount ?? 0;
}
