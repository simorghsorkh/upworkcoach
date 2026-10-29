import { and, desc, eq, gt, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { tehranDay, tehranDayEnd } from '@/lib/tehran-day';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { isStudentInScope, loadInScope } from '../access/scope';
import { recordAudit } from '../admin/service';
import type { AuditMeta } from '../catalog/service';
import { users } from '../identity/schema';
import type { StudentListItemDTO } from '../students/contracts';
import { listStudentItemsByHealth } from '../students/service';
import { recordTimelineEvent } from '../timeline/events';
import type {
  CreateFlagInput,
  FlagDTO,
  HealthDetailDTO,
  ListFlagsQuery,
  RecomputeInput,
  RecomputeResultDTO,
  SnoozeHealthInput,
  StuckQuery,
} from './contracts';
import { recomputeHealth, recomputeHealthSafe, sweepAllHealth } from './recompute';
import { overallBall } from './rules';
import { studentFlags, studentHealth } from './schema';
import { type HealthSummary, toHealthReasons, toHealthSummary } from './summary';

/**
 * health — staff API of health, flags and snooze (api.md section 9, PRD F7). Staff only:
 * every function rejects students with 403 (ADR-0004: «سلامت، دلیل‌ها، پرچم، snooze —
 * هنرجو هرگز»), and single resources go through `loadInScope` (missing = out of scope = 404).
 */

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// ---- detail --------------------------------------------------------------------------

async function loadDetail(db: DbOrTx, studentId: string, now: Date): Promise<HealthDetailDTO> {
  const snoozer = alias(users, 'snoozer');
  const read = async () => {
    const [row] = await db
      .select({
        status: studentHealth.status,
        reasons: studentHealth.reasons,
        churnRisk: studentHealth.churnRisk,
        statusSince: studentHealth.statusSince,
        redSince: studentHealth.redSince,
        computedAt: studentHealth.computedAt,
        snoozedUntil: studentHealth.snoozedUntil,
        snoozeReason: studentHealth.snoozeReason,
        snoozedById: studentHealth.snoozedBy,
        snoozedByName: snoozer.displayName,
      })
      .from(studentHealth)
      .leftJoin(snoozer, eq(snoozer.id, studentHealth.snoozedBy))
      .where(eq(studentHealth.studentId, studentId));
    return row;
  };
  let row = await read();
  if (!row) {
    // Never computed yet (e.g. right after the migration): compute now.
    await recomputeHealth(db, [studentId], now);
    row = await read();
  }
  if (!row) throw errors.notFound();
  const reasons = toHealthReasons(row.reasons);
  const snoozed = row.snoozedUntil && row.snoozedUntil.getTime() > now.getTime();
  return {
    studentId,
    status: row.status,
    reasons,
    churnRisk: row.churnRisk,
    ball: overallBall(reasons),
    statusSince: row.statusSince.toISOString(),
    redSince: iso(row.redSince),
    computedAt: row.computedAt.toISOString(),
    snoozedUntil: snoozed ? iso(row.snoozedUntil) : null,
    snoozeReason: snoozed ? row.snoozeReason : null,
    snoozedBy:
      snoozed && row.snoozedById && row.snoozedByName
        ? { id: row.snoozedById, displayName: row.snoozedByName }
        : null,
  };
}

/** GET /students/:id/health (A, M in scope). */
export async function getStudentHealth(
  actor: Actor,
  studentId: string,
  db: DbOrTx = getDb(),
): Promise<HealthDetailDTO> {
  assertStaff(actor);
  await loadInScope(db, actor, 'student', studentId);
  return loadDetail(db, studentId, new Date());
}

// ---- snooze («نادیده تا تاریخ») ---------------------------------------------------------

/**
 * PUT /students/:id/health/snooze (A, M in scope): hidden from the stuck lists until the end
 * of `until` (Tehran day, after today, at most a year ahead). Computing goes on (ADR-0005).
 */
export async function snoozeHealth(
  actor: Actor,
  studentId: string,
  input: SnoozeHealthInput,
  db: Db = getDb(),
): Promise<HealthDetailDTO> {
  assertStaff(actor);
  const now = new Date();
  const today = tehranDay(now);
  if (input.until < today) {
    throw errors.validation({ until: 'تاریخ نمی‌تواند قبل از امروز باشد.' });
  }
  const until = tehranDayEnd(input.until);
  if (until.getTime() - now.getTime() > 366 * 24 * 3600 * 1000) {
    throw errors.validation({ until: 'حداکثر تا یک سال بعد.' });
  }
  await db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    if (!(await hasHealthRow(tx, studentId))) await recomputeHealth(tx, [studentId], now);
    await tx
      .update(studentHealth)
      .set({ snoozedUntil: until, snoozeReason: input.reason, snoozedBy: actor.userId })
      .where(eq(studentHealth.studentId, studentId));
    await recordTimelineEvent(tx, {
      studentId,
      type: 'health.snoozed',
      actorId: actor.userId,
      data: { until: until.toISOString() },
      occurredAt: now,
    });
  });
  return loadDetail(db, studentId, now);
}

async function hasHealthRow(db: DbOrTx, studentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: studentHealth.studentId })
    .from(studentHealth)
    .where(eq(studentHealth.studentId, studentId));
  return row !== undefined;
}

/** DELETE /students/:id/health/snooze (A, M in scope): back on the lists. Idempotent. */
export async function clearHealthSnooze(
  actor: Actor,
  studentId: string,
  db: Db = getDb(),
): Promise<HealthDetailDTO> {
  assertStaff(actor);
  const now = new Date();
  await db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    const rows = await tx
      .update(studentHealth)
      .set({ snoozedUntil: null, snoozeReason: null, snoozedBy: null })
      .where(and(eq(studentHealth.studentId, studentId), gt(studentHealth.snoozedUntil, now)))
      .returning({ id: studentHealth.studentId });
    if (rows.length > 0) {
      await recordTimelineEvent(tx, {
        studentId,
        type: 'health.snoozed',
        actorId: actor.userId,
        data: { until: null },
        occurredAt: now,
      });
    }
  });
  return loadDetail(db, studentId, now);
}

// ---- flags (R-FLAG) --------------------------------------------------------------------

const creator = alias(users, 'flag_creator');
const clearer = alias(users, 'flag_clearer');

function isActiveFlag(row: { clearedAt: Date | null; expiresAt: Date | null }, now: Date) {
  return row.clearedAt === null && (row.expiresAt === null || row.expiresAt > now);
}

async function selectFlags(db: DbOrTx, where: ReturnType<typeof and>) {
  return db
    .select({
      id: studentFlags.id,
      studentId: studentFlags.studentId,
      category: studentFlags.category,
      level: studentFlags.level,
      note: studentFlags.note,
      expiresAt: studentFlags.expiresAt,
      createdAt: studentFlags.createdAt,
      clearedAt: studentFlags.clearedAt,
      createdById: studentFlags.createdBy,
      createdByName: creator.displayName,
      clearedById: studentFlags.clearedBy,
      clearedByName: clearer.displayName,
    })
    .from(studentFlags)
    .innerJoin(creator, eq(creator.id, studentFlags.createdBy))
    .leftJoin(clearer, eq(clearer.id, studentFlags.clearedBy))
    .where(where)
    .orderBy(desc(studentFlags.createdAt));
}

type FlagRow = Awaited<ReturnType<typeof selectFlags>>[number];

function toFlagDTO(row: FlagRow, now: Date): FlagDTO {
  return {
    id: row.id,
    studentId: row.studentId,
    category: row.category,
    level: row.level,
    note: row.note,
    expiresAt: iso(row.expiresAt),
    active: isActiveFlag(row, now),
    createdAt: row.createdAt.toISOString(),
    createdBy: { id: row.createdById, displayName: row.createdByName },
    clearedAt: iso(row.clearedAt),
    clearedBy:
      row.clearedById && row.clearedByName
        ? { id: row.clearedById, displayName: row.clearedByName }
        : null,
  };
}

/** GET /students/:id/flags (A, M in scope): newest first; `active=1` → only active ones. */
export async function listFlags(
  actor: Actor,
  studentId: string,
  query: ListFlagsQuery = {},
  db: DbOrTx = getDb(),
): Promise<FlagDTO[]> {
  assertStaff(actor);
  await loadInScope(db, actor, 'student', studentId);
  const now = new Date();
  const conditions = [eq(studentFlags.studentId, studentId)];
  if (query.active) {
    conditions.push(isNull(studentFlags.clearedAt));
    const notExpired = or(isNull(studentFlags.expiresAt), gt(studentFlags.expiresAt, now));
    if (notExpired) conditions.push(notExpired);
  }
  return (await selectFlags(db, and(...conditions))).map((r) => toFlagDTO(r, now));
}

/** POST /students/:id/flags (A, M in scope) → recompute health. */
export async function createFlag(
  actor: Actor,
  studentId: string,
  input: CreateFlagInput,
  db: Db = getDb(),
): Promise<FlagDTO> {
  assertStaff(actor);
  const now = new Date();
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    throw errors.validation({ expiresAt: 'تاریخ پایان باید در آینده باشد.' });
  }
  const id = await db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    const [row] = await tx
      .insert(studentFlags)
      .values({
        studentId,
        category: input.category,
        level: input.level,
        note: input.note ?? null,
        expiresAt: input.expiresAt ?? null,
        createdBy: actor.userId,
        createdAt: now,
      })
      .returning({ id: studentFlags.id });
    if (!row) throw new Error('createFlag returned no row');
    await recordTimelineEvent(tx, {
      studentId,
      type: 'flag.added',
      actorId: actor.userId,
      subjectType: 'flag',
      subjectId: row.id,
      data: { category: input.category, level: input.level },
      occurredAt: now,
    });
    return row.id;
  });
  await recomputeHealthSafe(studentId, db);
  const [row] = await selectFlags(db, and(eq(studentFlags.id, id)));
  if (!row) throw errors.notFound();
  return toFlagDTO(row, new Date());
}

/** POST /flags/:id/clear (A, M in scope). Clearing twice is a no-op (200). */
export async function clearFlag(actor: Actor, flagId: string, db: Db = getDb()): Promise<FlagDTO> {
  assertStaff(actor);
  const now = new Date();
  const studentId = await db.transaction(async (tx) => {
    const { studentId } = await loadInScope(tx, actor, 'flag', flagId);
    const rows = await tx
      .update(studentFlags)
      .set({ clearedAt: now, clearedBy: actor.userId })
      .where(and(eq(studentFlags.id, flagId), isNull(studentFlags.clearedAt)))
      .returning({ id: studentFlags.id });
    if (rows.length > 0) {
      await recordTimelineEvent(tx, {
        studentId,
        type: 'flag.cleared',
        actorId: actor.userId,
        subjectType: 'flag',
        subjectId: flagId,
        data: {},
        occurredAt: now,
      });
    }
    return studentId;
  });
  await recomputeHealthSafe(studentId, db);
  const [row] = await selectFlags(db, and(eq(studentFlags.id, flagId)));
  if (!row) throw errors.notFound();
  return toFlagDTO(row, new Date());
}

// ---- stuck list (F7) -------------------------------------------------------------------

/**
 * GET /stuck (A, M): yellow and red `active` students of the scope, red first then the
 * oldest status (F7). Paused, graduated and dropped never appear; snoozed ones only with
 * `includeSnoozed=1`. `mentorId` is admin-only (a mentor's value is ignored).
 */
/**
 * Health summaries of students the caller already scoped (the course board, sprint 5c). A
 * student without a computed health is left out.
 */
export async function healthSummariesOf(
  actor: Actor,
  studentIds: readonly string[],
  db: DbOrTx = getDb(),
): Promise<Map<string, HealthSummary>> {
  assertStaff(actor);
  const out = new Map<string, HealthSummary>();
  if (!studentIds.length) return out;
  const rows = await db
    .select({
      studentId: studentHealth.studentId,
      healthStatus: studentHealth.status,
      healthReasons: studentHealth.reasons,
      healthChurnRisk: studentHealth.churnRisk,
      healthSnoozedUntil: studentHealth.snoozedUntil,
      healthStatusSince: studentHealth.statusSince,
      healthComputedAt: studentHealth.computedAt,
    })
    .from(studentHealth)
    .where(
      and(
        eq(studentHealth.organizationId, actor.organizationId),
        inArray(studentHealth.studentId, [...studentIds]),
      ),
    );
  const now = new Date();
  for (const { studentId, ...row } of rows) {
    const summary = toHealthSummary(row, now);
    if (summary) out.set(studentId, summary);
  }
  return out;
}

export async function listStuckStudents(
  actor: Actor,
  query: StuckQuery = {},
  db: DbOrTx = getDb(),
): Promise<StudentListItemDTO[]> {
  assertStaff(actor);
  return listStudentItemsByHealth(db, actor, {
    health: query.level ? [query.level] : ['red', 'yellow'],
    mentorId: actor.role === 'admin' ? query.mentorId : undefined,
    includeSnoozed: query.includeSnoozed === true,
  });
}

// ---- admin -------------------------------------------------------------------------------

/** POST /admin/health/recompute (A): one student (must exist → else 422) or a full sweep. */
export async function adminRecompute(
  actor: Actor,
  input: RecomputeInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<RecomputeResultDTO> {
  if (actor.role !== 'admin') throw errors.forbidden();
  let result: RecomputeResultDTO;
  if (input.studentId) {
    if (!isUuid(input.studentId) || !(await isStudentInScope(db, actor, input.studentId))) {
      throw errors.validation({ studentId: 'مقدار نامعتبر است' });
    }
    const n = await recomputeHealth(db, [input.studentId]);
    if (n === 0) throw errors.validation({ studentId: 'مقدار نامعتبر است' });
    result = { recomputed: n, resumed: 0 };
  } else {
    result = await sweepAllHealth(db, actor.organizationId);
  }
  await recordAudit(db, {
    actorId: actor.userId,
    action: 'health.recomputed',
    targetType: input.studentId ? 'student' : undefined,
    targetId: input.studentId,
    data: { recomputed: result.recomputed },
    ip: meta.ip ?? null,
  });
  return result;
}

// ---- «منتظر ما»: red without action (data-model.md 4-3) ---------------------------------

/**
 * Red students of the scope with no staff note since `red_since` (read-only SQL). The
 * caller applies the SLA (`redNoActionHours`) and the escalation to all admins.
 */
export async function redWithoutActionRows(
  db: DbOrTx,
  scope: SQL,
  mentorId: string | undefined,
): Promise<Array<{ studentId: string; primaryMentorId: string | null; redSince: Date }>> {
  const mentorFilter = mentorId ? sql`AND students.primary_mentor_id = ${mentorId}` : sql``;
  const result = await db.execute(sql`
    SELECT h.student_id AS "studentId", students.primary_mentor_id AS "primaryMentorId",
           h.red_since AS "redSince"
      FROM student_health h
      JOIN students ON students.user_id = h.student_id
     WHERE h.status = 'red' AND h.red_since IS NOT NULL
       AND students.lifecycle_status = 'active'
       AND (${scope})
       ${mentorFilter}
       AND NOT EXISTS (
         SELECT 1 FROM notes n
          WHERE n.student_id = h.student_id AND n.deleted_at IS NULL
            AND n.occurred_at > h.red_since
       )
  `);
  return (
    result.rows as Array<{
      studentId: string;
      primaryMentorId: string | null;
      redSince: Date | string;
    }>
  ).map((r) => ({
    studentId: r.studentId,
    primaryMentorId: r.primaryMentorId,
    redSince: r.redSince instanceof Date ? r.redSince : new Date(r.redSince),
  }));
}
