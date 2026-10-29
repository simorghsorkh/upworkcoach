import { and, asc, desc, eq, inArray, ne, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/server/db';
import { users } from '../identity/schema';
import { enrollments, programRuns } from '../programs/schema';
import { tasks } from '../tasks/schema';
import { goals, mentoringSessions, type SessionStatus } from './schema';

/**
 * mentoring — queries. Writes only `mentoring_sessions` and `goals`; reads runs, enrollments
 * and the tasks of a session (a session's next actions are written by the tasks module).
 */

const studentUser = alias(users, 'session_student');
const mentorUser = alias(users, 'session_mentor');

const sessionColumns = {
  id: mentoringSessions.id,
  organizationId: mentoringSessions.organizationId,
  runId: mentoringSessions.runId,
  runTitle: programRuns.title,
  runKind: programRuns.kind,
  runMode: programRuns.mode,
  legacyPathId: programRuns.legacyPathId,
  enrollmentId: mentoringSessions.enrollmentId,
  studentId: enrollments.studentId,
  studentName: studentUser.displayName,
  mentorId: mentoringSessions.mentorId,
  mentorName: mentorUser.displayName,
  scheduledAt: mentoringSessions.scheduledAt,
  durationMinutes: mentoringSessions.durationMinutes,
  location: mentoringSessions.location,
  status: mentoringSessions.status,
  countsTowardQuota: mentoringSessions.countsTowardQuota,
  cancelledReason: mentoringSessions.cancelledReason,
};

export type SessionRow = {
  id: string;
  organizationId: string;
  runId: string;
  runTitle: string;
  runKind: 'program' | 'one_on_one';
  runMode: 'group' | 'individual';
  legacyPathId: string | null;
  enrollmentId: string | null;
  studentId: string | null;
  studentName: string | null;
  mentorId: string;
  mentorName: string;
  scheduledAt: Date;
  durationMinutes: number;
  location: string | null;
  status: SessionStatus;
  countsTowardQuota: boolean;
  cancelledReason: string | null;
  canEdit: boolean;
};

/**
 * Sessions matching `where`, with `canEdit` computed by the caller's SQL. Upcoming ones in
 * time order, past ones newest first.
 */
export async function listSessions(
  db: DbOrTx,
  where: SQL,
  canEdit: SQL<boolean>,
  order: 'asc' | 'desc',
  limit = 200,
): Promise<SessionRow[]> {
  const rows = await db
    .select({ ...sessionColumns, canEdit: sql<boolean>`${canEdit}`.as('can_edit') })
    .from(mentoringSessions)
    .innerJoin(programRuns, eq(programRuns.id, mentoringSessions.runId))
    .leftJoin(enrollments, eq(enrollments.id, mentoringSessions.enrollmentId))
    .leftJoin(studentUser, eq(studentUser.id, enrollments.studentId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentoringSessions.mentorId))
    .where(where)
    .orderBy(
      order === 'asc' ? asc(mentoringSessions.scheduledAt) : desc(mentoringSessions.scheduledAt),
      asc(mentoringSessions.id),
    )
    .limit(limit);
  return rows as SessionRow[];
}

export async function findSession(db: DbOrTx, org: string, id: string, lock = false) {
  const query = db
    .select({ ...sessionColumns, canEdit: sql<boolean>`true`.as('can_edit') })
    .from(mentoringSessions)
    .innerJoin(programRuns, eq(programRuns.id, mentoringSessions.runId))
    .leftJoin(enrollments, eq(enrollments.id, mentoringSessions.enrollmentId))
    .leftJoin(studentUser, eq(studentUser.id, enrollments.studentId))
    .innerJoin(mentorUser, eq(mentorUser.id, mentoringSessions.mentorId))
    .where(and(eq(mentoringSessions.organizationId, org), eq(mentoringSessions.id, id)));
  const [row] = lock ? await query.for('update', { of: mentoringSessions }) : await query;
  return (row as SessionRow | undefined) ?? null;
}

export async function insertSession(
  db: DbOrTx,
  values: {
    runId: string;
    enrollmentId: string | null;
    mentorId: string;
    scheduledAt: Date;
    durationMinutes: number;
    location: string | null;
    createdBy: string;
  },
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(mentoringSessions)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning({ id: mentoringSessions.id });
  return (row as { id: string }).id;
}

export async function updateSession(
  db: DbOrTx,
  id: string,
  values: Partial<{
    mentorId: string;
    scheduledAt: Date;
    durationMinutes: number;
    location: string | null;
    status: SessionStatus;
    cancelledReason: string | null;
    countsTowardQuota: boolean;
  }>,
  now: Date,
): Promise<void> {
  await db
    .update(mentoringSessions)
    .set({ ...values, updatedAt: now })
    .where(eq(mentoringSessions.id, id));
}

/** The mentor's other scheduled sessions that overlap [start, end). */
export async function countOverlaps(
  db: DbOrTx,
  org: string,
  mentorId: string,
  start: Date,
  end: Date,
  exceptId: string | null,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mentoringSessions)
    .where(
      and(
        eq(mentoringSessions.organizationId, org),
        eq(mentoringSessions.mentorId, mentorId),
        eq(mentoringSessions.status, 'scheduled'),
        exceptId ? ne(mentoringSessions.id, exceptId) : undefined,
        sql`${mentoringSessions.scheduledAt} < ${end.toISOString()}::timestamptz`,
        sql`${mentoringSessions.scheduledAt} + make_interval(mins => ${mentoringSessions.durationMinutes}) > ${start.toISOString()}::timestamptz`,
      ),
    );
  return row?.n ?? 0;
}

/** Next actions (tasks) of some sessions, optionally only one student's. */
export async function listActions(db: DbOrTx, sessionIds: string[], studentId?: string) {
  if (!sessionIds.length) return [];
  const rows = await db
    .select({
      id: tasks.id,
      sessionId: tasks.sessionId,
      title: tasks.title,
      status: tasks.status,
      dueAt: tasks.dueAt,
      studentId: tasks.studentId,
      studentName: users.displayName,
    })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.studentId))
    .where(
      and(
        inArray(tasks.sessionId, sessionIds),
        ne(tasks.status, 'cancelled'),
        studentId ? eq(tasks.studentId, studentId) : undefined,
      ),
    )
    .orderBy(asc(tasks.createdAt));
  return rows.map((r) => ({ ...r, sessionId: r.sessionId as string }));
}

/** Members of a run who hold a seat (a group session's next action goes to one of them). */
export async function seatedMember(db: DbOrTx, runId: string, studentId: string) {
  const [row] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.runId, runId),
        eq(enrollments.studentId, studentId),
        inArray(enrollments.status, ['active', 'paused']),
      ),
    );
  return row?.id ?? null;
}

// ---- goals ---------------------------------------------------------------------------------

export type GoalRow = typeof goals.$inferSelect;

export async function listGoals(db: DbOrTx, enrollmentIds: string[]): Promise<GoalRow[]> {
  if (!enrollmentIds.length) return [];
  return db
    .select()
    .from(goals)
    .where(inArray(goals.enrollmentId, enrollmentIds))
    .orderBy(asc(goals.createdAt), asc(goals.id));
}

export async function findGoal(db: DbOrTx, org: string, id: string): Promise<GoalRow | null> {
  const [row] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.organizationId, org), eq(goals.id, id)));
  return row ?? null;
}

export async function insertGoal(
  db: DbOrTx,
  values: {
    enrollmentId: string;
    title: string;
    description: string | null;
    targetDate: string | null;
    createdBy: string;
  },
  now: Date,
): Promise<GoalRow> {
  const [row] = await db
    .insert(goals)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning();
  return row as GoalRow;
}

export async function updateGoal(
  db: DbOrTx,
  id: string,
  values: Partial<Pick<GoalRow, 'title' | 'description' | 'targetDate' | 'status'>> & {
    decidedAt?: Date | null;
    decidedBy?: string | null;
  },
  now: Date,
): Promise<GoalRow> {
  const [row] = await db
    .update(goals)
    .set({ ...values, updatedAt: now })
    .where(eq(goals.id, id))
    .returning();
  return row as GoalRow;
}

/** The mentee's own enrollments (not dropped) — what their sessions and goals hang off. */
export async function ownEnrollments(db: DbOrTx, org: string, studentId: string) {
  return db
    .select({ id: enrollments.id, runId: enrollments.runId, status: enrollments.status })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.organizationId, org),
        eq(enrollments.studentId, studentId),
        ne(enrollments.status, 'dropped'),
      ),
    );
}
