import { eq, inArray, max, min, sql } from 'drizzle-orm';
import { tehranDay } from '@/lib/tehran-day';
import { type DbOrTx, getDb } from '@/server/db';
import { logger, safeError } from '@/server/logger';
import type { CheckinSettings, HealthRules } from '../catalog/contracts';
import { getCheckinSettings, getHealthRules } from '../catalog/service';
import { resumeExpiredPauses } from '../students/lifecycle-auto';
import { students } from '../students/schema';
import { recordTimelineEvent } from '../timeline/events';
import { listSweepStudentIds, loadHealthInputs } from './input-repo';
import {
  evaluateHealth,
  type HealthResult,
  reasonSignature,
  type StudentHealthInput,
} from './rules';
import { studentHealth } from './schema';

/**
 * health — storing results (ADR-0005 option D). Two callers, one pure function:
 *  - after the commit of every action that changes an input: `recomputeHealthSafe(id)`
 *    (best-effort: a failure is logged and the hourly sweep repairs it);
 *  - the hourly job `health.sweep` and changes of the thresholds: `sweepAllHealth()`.
 * Writes are idempotent upserts under `pg_advisory_xact_lock` per student, so two
 * concurrent computations never record a duplicate `health.changed` event.
 */

type Config = { rules: HealthRules; version: number; checkin: CheckinSettings };

async function loadConfig(db: DbOrTx): Promise<Config> {
  const [{ rules, version }, checkin] = await Promise.all([
    getHealthRules(db),
    getCheckinSettings(db),
  ]);
  return { rules, version, checkin };
}

/** Writes one result (inside the caller's transaction, under the student's lock). */
async function storeResult(
  tx: DbOrTx,
  studentId: string,
  result: HealthResult,
  config: Config,
  now: Date,
): Promise<void> {
  const [prev] = await tx
    .select({
      status: studentHealth.status,
      reasons: studentHealth.reasons,
      statusSince: studentHealth.statusSince,
      redSince: studentHealth.redSince,
    })
    .from(studentHealth)
    .where(eq(studentHealth.studentId, studentId));
  const statusChanged = !prev || prev.status !== result.status;
  const values = {
    status: result.status,
    reasons: result.reasons,
    churnRisk: result.churnRisk,
    statusSince: statusChanged ? now : prev.statusSince,
    redSince:
      result.status === 'red' ? (prev?.status === 'red' ? (prev.redSince ?? now) : now) : null,
    computedAt: now,
    settingsVersion: config.version,
  };
  await tx
    .insert(studentHealth)
    .values({ studentId, ...values })
    .onConflictDoUpdate({ target: studentHealth.studentId, set: values });
  // Only a different status or set of (rule, level) is an event; changed facts are not
  // (9 → 10 days must not flood the timeline). The very first computation is not either.
  if (
    prev &&
    (statusChanged || reasonSignature(prev.reasons) !== reasonSignature(result.reasons))
  ) {
    await recordTimelineEvent(tx, {
      studentId,
      type: 'health.changed',
      actorId: null,
      data: {
        from: prev.status,
        to: result.status,
        rules: result.reasons.map((r) => `${r.rule}:${r.level}`),
        churnRisk: result.churnRisk,
      },
      occurredAt: now,
    });
  }
}

async function lockStudent(tx: DbOrTx, studentId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`health:${studentId}`}))`);
}

/**
 * Recomputes the given students now (inputs read under each student's lock). Unknown ids
 * are skipped. Returns how many were stored.
 */
export async function recomputeHealth(
  db: DbOrTx,
  studentIds: readonly string[],
  now: Date = new Date(),
): Promise<number> {
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return 0;
  const config = await loadConfig(db);
  let stored = 0;
  for (const id of ids) {
    await db.transaction(async (tx) => {
      await lockStudent(tx, id);
      const input = (await loadHealthInputs(tx, [id], now)).get(id);
      if (!input) return;
      await storeResult(
        tx,
        id,
        evaluateHealth(input, config.rules, now, config.checkin),
        config,
        now,
      );
      stored += 1;
    });
  }
  return stored;
}

/**
 * After-commit hook of every service that changes an input (data-model.md 4-1). Never
 * throws: the user's action has already been committed.
 */
export async function recomputeHealthSafe(
  studentIds: string | readonly string[],
  db: DbOrTx = getDb(),
): Promise<void> {
  const ids = typeof studentIds === 'string' ? [studentIds] : studentIds;
  try {
    await recomputeHealth(db, ids);
  } catch (err) {
    logger.error(
      { event: 'health.recompute_failed', count: ids.length, error: safeError(err) },
      'health recompute failed; the hourly sweep will retry',
    );
  }
}

/**
 * Job `health.sweep` (hourly, minute 5 Tehran; also right after a threshold change):
 * returns paused students whose date has come to `active`, then evaluates every `active` and
 * `paused` student with batched inputs (no N+1) and stores each under its lock.
 */
export async function sweepAllHealth(
  db: DbOrTx = getDb(),
  now: Date = new Date(),
): Promise<{ recomputed: number; resumed: number }> {
  const resumed = await resumeExpiredPauses(db, tehranDay(now), now);
  const config = await loadConfig(db);
  const ids = await listSweepStudentIds(db);
  const inputs = await loadHealthInputs(db, ids, now);
  let recomputed = 0;
  for (const [id, input] of inputs) {
    await db.transaction(async (tx) => {
      await lockStudent(tx, id);
      await storeResult(tx, id, evaluateFor(input, config, now), config, now);
    });
    recomputed += 1;
  }
  logger.info({ event: 'health.sweep', recomputed, resumed: resumed.length }, 'health sweep done');
  return { recomputed, resumed: resumed.length };
}

function evaluateFor(input: StudentHealthInput, config: Config, now: Date): HealthResult {
  return evaluateHealth(input, config.rules, now, config.checkin);
}

/** `/healthz` (ADR-0007): time of the latest stored result, or null. */
export async function getLastHealthSweepAt(db: DbOrTx = getDb()): Promise<Date | null> {
  const [row] = await db.select({ at: max(studentHealth.computedAt) }).from(studentHealth);
  return row?.at ?? null;
}

/** ADR-0005 «پیامدها»: results older than this mean the hourly sweep is not running. */
export const HEALTH_STALE_AFTER_MS = 3 * 3600 * 1000;

export type HealthFreshness = {
  /** Latest stored result (any student). */
  lastHealthSweepAt: Date | null;
  /** Oldest result among the students the sweep must refresh (`active`, `paused`). */
  oldestComputedAt: Date | null;
  /** True when that oldest result is older than 3 hours (F-08, F-14). */
  stale: boolean;
};

/**
 * Pure: the sweep refreshes every `active` / `paused` student each hour, so the OLDEST of
 * their results shows whether it still runs. (The latest one is not enough: per-action
 * recomputes keep it fresh even when the job is dead.) No results at all → not stale.
 */
export function isHealthStale(oldestComputedAt: Date | null, now: Date): boolean {
  return (
    oldestComputedAt !== null && now.getTime() - oldestComputedAt.getTime() > HEALTH_STALE_AFTER_MS
  );
}

/** `/healthz` (F-08) and the admin's «امروز» (F-14). */
export async function getHealthFreshness(
  db: DbOrTx = getDb(),
  now: Date = new Date(),
): Promise<HealthFreshness> {
  const [row] = await db
    .select({ latest: max(studentHealth.computedAt), oldest: min(studentHealth.computedAt) })
    .from(studentHealth)
    .innerJoin(students, eq(students.userId, studentHealth.studentId))
    .where(inArray(students.lifecycleStatus, ['active', 'paused']));
  const lastHealthSweepAt = (await getLastHealthSweepAt(db)) ?? row?.latest ?? null;
  const oldestComputedAt = row?.oldest ?? null;
  return { lastHealthSweepAt, oldestComputedAt, stale: isHealthStale(oldestComputedAt, now) };
}
