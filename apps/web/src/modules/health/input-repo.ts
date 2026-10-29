import { and, desc, eq, gt, inArray, isNull, max, notInArray, or, sql } from 'drizzle-orm';
import { addDays, tehranDay } from '@/lib/tehran-day';
import type { DbOrTx } from '@/server/db';
import { checkins } from '../checkins/schema';
import { enrollments, programRuns, runNodes } from '../programs/schema';
import { students } from '../students/schema';
import { tasks } from '../tasks/schema';
import { timelineEvents } from '../timeline/schema';
import type { HealthPhaseInput, HealthTaskInput, StudentHealthInput } from './rules';
import { studentFlags } from './schema';

/**
 * health — read-model inputs of `evaluateHealth` (ADR-0005: "input.repo"). Read-only SQL over
 * students, enrollments and their current phases (sprint 5c), tasks, flags, check-ins and
 * timeline events (tech-stack.md section 3,
 * rule 3: health is a read-model). A fixed number of aggregate queries for any number of
 * students (no N+1).
 */

const FINAL = ['accepted', 'cancelled'] as const;
/** Check-ins of the last weeks are enough for R-CHECKIN (12-week cap) and R-MOOD. */
const CHECKIN_LOOKBACK_DAYS = 13 * 7;

export async function loadHealthInputs(
  db: DbOrTx,
  studentIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, StudentHealthInput>> {
  const out = new Map<string, StudentHealthInput>();
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return out;

  const [rows, phases, openTasks, closed, flags, recentCheckins, resumes] = await Promise.all([
    db
      .select({
        id: students.userId,
        lifecycleStatus: students.lifecycleStatus,
        joinedAt: students.joinedAt,
        lastActivityAt: students.lastActivityAt,
      })
      .from(students)
      .where(inArray(students.userId, ids)),
    // Current phase of each active enrollment in a run that is still open.
    db
      .select({
        studentId: enrollments.studentId,
        enteredAt:
          sql<Date>`coalesce(${enrollments.phaseEnteredAt}, ${enrollments.enrolledAt})`.mapWith(
            (v: string | Date) => new Date(v),
          ),
        expectedDays: runNodes.expectedDays,
        isOpenEnded: runNodes.isOpenEnded,
      })
      .from(enrollments)
      .innerJoin(runNodes, eq(runNodes.id, enrollments.currentPhaseNodeId))
      .innerJoin(programRuns, eq(programRuns.id, enrollments.runId))
      .where(
        and(
          inArray(enrollments.studentId, ids),
          eq(enrollments.status, 'active'),
          inArray(programRuns.status, ['draft', 'active']),
        ),
      ),
    db
      .select({
        studentId: tasks.studentId,
        status: tasks.status,
        dueAt: tasks.dueAt,
        revisionCount: tasks.revisionCount,
        extensionCount: tasks.extensionCount,
      })
      .from(tasks)
      .where(and(inArray(tasks.studentId, ids), notInArray(tasks.status, [...FINAL]))),
    db
      .select({ studentId: tasks.studentId, closedAt: max(tasks.closedAt) })
      .from(tasks)
      .where(and(inArray(tasks.studentId, ids), inArray(tasks.status, [...FINAL])))
      .groupBy(tasks.studentId),
    db
      .select({
        studentId: studentFlags.studentId,
        level: studentFlags.level,
        category: studentFlags.category,
      })
      .from(studentFlags)
      .where(
        and(
          inArray(studentFlags.studentId, ids),
          isNull(studentFlags.clearedAt),
          or(isNull(studentFlags.expiresAt), gt(studentFlags.expiresAt, now)),
        ),
      ),
    db
      .select({ studentId: checkins.studentId, weekStart: checkins.weekStart, mood: checkins.mood })
      .from(checkins)
      .where(
        and(
          inArray(checkins.studentId, ids),
          sql`${checkins.weekStart} >= ${addDays(tehranDay(now), -CHECKIN_LOOKBACK_DAYS)}`,
        ),
      )
      .orderBy(desc(checkins.weekStart)),
    // Last return to `active` (from a pause or a closed state): weeks before it do not count.
    db
      .select({ studentId: timelineEvents.studentId, at: max(timelineEvents.occurredAt) })
      .from(timelineEvents)
      .where(
        and(
          inArray(timelineEvents.studentId, ids),
          eq(timelineEvents.type, 'student.lifecycle_changed'),
          sql`${timelineEvents.data}->>'to' = 'active'`,
          sql`coalesce(${timelineEvents.data}->>'from', '') <> 'active'`,
        ),
      )
      .groupBy(timelineEvents.studentId),
  ]);

  const tasksBy = new Map<string, HealthTaskInput[]>();
  for (const t of openTasks) {
    const list = tasksBy.get(t.studentId) ?? [];
    list.push({
      status: t.status as HealthTaskInput['status'],
      dueAt: t.dueAt,
      revisionCount: t.revisionCount,
      extensionCount: t.extensionCount,
    });
    tasksBy.set(t.studentId, list);
  }
  const closedBy = new Map(closed.map((c) => [c.studentId, c.closedAt]));
  const flagsBy = new Map<string, StudentHealthInput['flags']>();
  for (const f of flags) {
    const list = flagsBy.get(f.studentId) ?? [];
    list.push({ level: f.level, category: f.category });
    flagsBy.set(f.studentId, list);
  }
  const checkinsBy = new Map<string, StudentHealthInput['checkins']>();
  for (const c of recentCheckins) {
    const list = checkinsBy.get(c.studentId) ?? [];
    list.push({ weekStart: c.weekStart, mood: c.mood });
    checkinsBy.set(c.studentId, list);
  }
  const resumedBy = new Map(resumes.map((r) => [r.studentId, r.at]));
  const phasesBy = new Map<string, HealthPhaseInput[]>();
  for (const p of phases) {
    const list = phasesBy.get(p.studentId) ?? [];
    list.push({ enteredAt: p.enteredAt, expectedDays: p.expectedDays, isOpenEnded: p.isOpenEnded });
    phasesBy.set(p.studentId, list);
  }

  for (const row of rows) {
    const resumed = resumedBy.get(row.id) ?? null;
    out.set(row.id, {
      lifecycleStatus: row.lifecycleStatus,
      joinedAt: row.joinedAt,
      lastActivityAt: row.lastActivityAt,
      phases: phasesBy.get(row.id) ?? [],
      openTasks: tasksBy.get(row.id) ?? [],
      lastTaskClosedAt: closedBy.get(row.id) ?? null,
      flags: flagsBy.get(row.id) ?? [],
      checkins: checkinsBy.get(row.id) ?? [],
      activeSince: resumed && resumed > row.joinedAt ? resumed : row.joinedAt,
    });
  }
  return out;
}

/** Students the hourly sweep evaluates: `active` and `paused` (ADR-0005). */
/** Students the sweep evaluates, with their organization (all, or one organization's). */
export async function listSweepStudents(
  db: DbOrTx,
  organizationId?: string,
): Promise<{ id: string; organizationId: string }[]> {
  const lifecycle = inArray(students.lifecycleStatus, ['active', 'paused']);
  return db
    .select({ id: students.userId, organizationId: students.organizationId })
    .from(students)
    .where(
      organizationId ? and(lifecycle, eq(students.organizationId, organizationId)) : lifecycle,
    );
}
