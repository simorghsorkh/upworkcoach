import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { messagesFor } from '@/i18n/messages';
import { dateTimeIn, dayIn, partsIn } from '@/lib/org-day';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { loadInScope, scopeCondition, staffStudentScope } from '../access/scope';
import { notify } from '../notifications/service';
import { holdsSeat, isRunOpen } from '../programs/policy';
import { enrollments, type RunStatus } from '../programs/schema';
import {
  defaultMentorOf,
  enrollmentForStaff,
  isActiveStaff,
  organizationTimeZone,
  runForStaff,
} from '../programs/service';
import { insertSessionAction } from '../tasks/service';
import type {
  CreateGoalInput,
  CreateSessionInput,
  GoalDTO,
  GoalListDTO,
  SessionActionInput,
  SessionDTO,
  SessionListQuery,
  SessionWriteDTO,
  UpdateGoalInput,
  UpdateSessionInput,
} from './contracts';
import * as repo from './repo';
import { mentoringSessions } from './schema';

/**
 * mentoring — sessions and goals (ADR-0012 sections 4, 6 and 7; Coach Office sprint 5b).
 *
 * Who: staff who may act on an enrollment (admin, staff of its run, the mentee's mentor) book
 * and record its sessions and goals; a group session needs someone who manages the run. A
 * mentee sees their own sessions, the group sessions of runs they are in, and their goals.
 * Sessions are entered as a day and a time in the organization's time zone and kept in UTC.
 * Running out of the package never blocks a session (programs `packageUsage` warns).
 */

const M = messagesFor('fa').mentoringErrors;
const INVALID = messagesFor('fa').validation.invalid;

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

function minutesOf(time: string): [number, number] {
  const [h, m] = time.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

function endOf(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60_000);
}

// ---- visibility -----------------------------------------------------------------------------

type Visibility = { visible: SQL; canEdit: SQL<boolean> };

/** Which sessions the actor sees, and which of them they may change (as SQL). */
async function visibilityOf(db: DbOrTx, actor: Actor): Promise<Visibility> {
  const org = eq(mentoringSessions.organizationId, actor.organizationId);
  if (actor.role === 'student') {
    return {
      visible: sql`(${org} AND (${enrollments.studentId} = ${actor.userId} OR (${mentoringSessions.enrollmentId} IS NULL AND EXISTS (SELECT 1 FROM enrollments vis_e WHERE vis_e.run_id = ${mentoringSessions.runId} AND vis_e.student_id = ${actor.userId} AND vis_e.status <> 'dropped'))))`,
      canEdit: sql<boolean>`false`,
    };
  }
  assertStaff(actor);
  if (actor.role === 'admin') return { visible: org, canEdit: sql<boolean>`true` };
  const scope = await staffStudentScope(db, actor);
  const mine = sql`${mentoringSessions.mentorId} = ${actor.userId}`;
  const runStaff = sql`EXISTS (SELECT 1 FROM run_staff vis_rs WHERE vis_rs.run_id = ${mentoringSessions.runId} AND vis_rs.user_id = ${actor.userId} AND vis_rs.ended_at IS NULL)`;
  const member = sql`(${mentoringSessions.enrollmentId} IS NOT NULL AND ${scopeCondition(scope, enrollments.studentId, enrollments.organizationId)})`;
  const groupOfMentee = sql`(${mentoringSessions.enrollmentId} IS NULL AND EXISTS (SELECT 1 FROM enrollments vis_g WHERE vis_g.run_id = ${mentoringSessions.runId} AND ${scopeCondition(scope, sql`vis_g.student_id`, sql`vis_g.organization_id`)}))`;
  return {
    visible: sql`(${org} AND (${mine} OR ${runStaff} OR ${member} OR ${groupOfMentee}))`,
    canEdit: sql<boolean>`(${mine} OR ${runStaff} OR ${member})`,
  };
}

/**
 * A session the actor may change, locked: admin; its mentor; for a member's session whoever
 * may act on that enrollment; for a group session whoever manages the run. Else 404/403.
 */
async function sessionForEdit(tx: DbOrTx, actor: Actor, id: string): Promise<repo.SessionRow> {
  assertStaff(actor);
  if (!isUuid(id)) throw errors.notFound();
  const row = await repo.findSession(tx, actor.organizationId, id, true);
  if (!row) throw errors.notFound();
  if (actor.role === 'admin' || row.mentorId === actor.userId) return row;
  if (row.enrollmentId) {
    await enrollmentForStaff(tx, actor, row.enrollmentId);
    return row;
  }
  const { manage } = await runForStaff(tx, actor, row.runId);
  if (!manage) throw errors.forbidden();
  return row;
}

async function assertMentor(db: DbOrTx, actor: Actor, mentorId: string): Promise<void> {
  if (mentorId === actor.userId) return;
  if (!(await isActiveStaff(db, actor.organizationId, mentorId))) {
    throw errors.validation({ mentorId: M.mentorNotStaff });
  }
}

// ---- DTOs -----------------------------------------------------------------------------------

async function toDTOs(
  db: DbOrTx,
  actor: Actor,
  rows: readonly repo.SessionRow[],
): Promise<SessionDTO[]> {
  const actions = await repo.listActions(
    db,
    rows.map((r) => r.id),
    actor.role === 'student' ? actor.userId : undefined,
  );
  return rows.map((r) => ({
    id: r.id,
    run: { id: r.runId, title: r.runTitle, kind: r.runKind },
    enrollmentId: r.enrollmentId,
    student:
      r.enrollmentId && r.studentId ? { id: r.studentId, displayName: r.studentName ?? '' } : null,
    mentor: { id: r.mentorId, displayName: r.mentorName },
    scheduledAt: r.scheduledAt.toISOString(),
    endsAt: endOf(r.scheduledAt, r.durationMinutes).toISOString(),
    durationMinutes: r.durationMinutes,
    location: r.location,
    status: r.status,
    countsTowardQuota: r.countsTowardQuota,
    cancelledReason: r.cancelledReason,
    actions: actions
      .filter((a) => a.sessionId === r.id)
      .map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        dueAt: a.dueAt.toISOString(),
        student: { id: a.studentId, displayName: a.studentName },
      })),
    can: { edit: actor.role !== 'student' && r.canEdit },
  }));
}

async function sessionDTO(db: DbOrTx, actor: Actor, id: string): Promise<SessionDTO> {
  const { visible, canEdit } = await visibilityOf(db, actor);
  const rows = await repo.listSessions(
    db,
    sql`${visible} AND ${mentoringSessions.id} = ${id}`,
    canEdit,
    'asc',
    1,
  );
  const [dto] = await toDTOs(db, actor, rows);
  if (!dto) throw errors.notFound();
  return dto;
}

async function writeResult(db: DbOrTx, actor: Actor, id: string): Promise<SessionWriteDTO> {
  const session = await sessionDTO(db, actor, id);
  const overlaps =
    session.status === 'scheduled'
      ? await repo.countOverlaps(
          db,
          actor.organizationId,
          session.mentor.id,
          new Date(session.scheduledAt),
          new Date(session.endsAt),
          session.id,
        )
      : 0;
  return { session, overlaps };
}

// ---- sessions -------------------------------------------------------------------------------

/**
 * GET /sessions. By run (staff who see the run) or by student (staff in scope); without
 * either a mentor gets their own sessions, an admin the organization's and a mentee theirs.
 * `upcoming`: still scheduled and not over, soonest first; `past`: the rest, newest first.
 */
export async function listSessions(
  actor: Actor,
  query: SessionListQuery = {},
  now: Date = new Date(),
  db: DbOrTx = getDb(),
): Promise<SessionDTO[]> {
  const { visible, canEdit } = await visibilityOf(db, actor);
  const parts: SQL[] = [visible];
  if (query.runId) {
    if (actor.role !== 'student') await runForStaff(db, actor, query.runId);
    parts.push(sql`${mentoringSessions.runId} = ${query.runId}`);
  }
  if (query.studentId && actor.role !== 'student') {
    await loadInScope(db, actor, 'student', query.studentId);
    parts.push(
      sql`(${enrollments.studentId} = ${query.studentId} OR (${mentoringSessions.enrollmentId} IS NULL AND EXISTS (SELECT 1 FROM enrollments of_e WHERE of_e.run_id = ${mentoringSessions.runId} AND of_e.student_id = ${query.studentId} AND of_e.status <> 'dropped')))`,
    );
  }
  if (!query.runId && !query.studentId && actor.role === 'mentor') {
    parts.push(sql`${mentoringSessions.mentorId} = ${actor.userId}`);
  }
  const upcoming = sql`(${mentoringSessions.status} = 'scheduled' AND ${mentoringSessions.scheduledAt} + make_interval(mins => ${mentoringSessions.durationMinutes}) > ${now.toISOString()}::timestamptz)`;
  if (query.when === 'upcoming') parts.push(upcoming);
  if (query.when === 'past') parts.push(sql`NOT ${upcoming}`);
  const rows = await repo.listSessions(
    db,
    sql.join(parts, sql` AND `),
    canEdit,
    query.when === 'upcoming' ? 'asc' : 'desc',
  );
  return toDTOs(db, actor, rows);
}

/**
 * POST /sessions. A member's session: staff who may act on the enrollment, while the
 * member holds a seat. A group session: whoever manages the (group, non-legacy) run.
 */
export async function createSession(
  actor: Actor,
  input: CreateSessionInput,
  db: Db = getDb(),
): Promise<SessionWriteDTO> {
  assertStaff(actor);
  const id = await db.transaction(async (tx) => {
    let enrollmentId: string | null = null;
    let runStatus: RunStatus;
    let defaultMentor: string | null = null;
    if (input.enrollmentId) {
      const { row, run } = await enrollmentForStaff(tx, actor, input.enrollmentId);
      if (run.id !== input.runId) throw errors.validation({ enrollmentId: M.memberNotInRun });
      if (!holdsSeat(row.status)) throw errors.conflict(M.notSeated);
      enrollmentId = row.id;
      runStatus = run.status;
      defaultMentor = await defaultMentorOf(tx, row.id, run.id);
    } else {
      const { run, manage, staff } = await runForStaff(tx, actor, input.runId);
      if (run.mode !== 'group') throw errors.validation({ enrollmentId: M.memberRequired });
      if (run.legacyPathId !== null) throw errors.conflict(M.legacyGroup);
      if (!manage) throw errors.forbidden();
      runStatus = run.status;
      defaultMentor = staff.find((s) => s.role === 'mentor')?.userId ?? null;
    }
    if (!isRunOpen(runStatus)) throw errors.conflict(M.runClosed);
    const mentorId =
      input.mentorId ?? (actor.role === 'mentor' ? actor.userId : (defaultMentor ?? actor.userId));
    await assertMentor(tx, actor, mentorId);
    const timeZone = await organizationTimeZone(tx, actor.organizationId);
    const [hour, minute] = minutesOf(input.time);
    const scheduledAt = dateTimeIn(timeZone, input.day, hour, minute);
    const now = new Date();
    const sessionId = await repo.insertSession(
      tx,
      {
        runId: input.runId,
        enrollmentId,
        mentorId,
        scheduledAt,
        durationMinutes: input.durationMinutes,
        location: input.location ?? null,
        createdBy: actor.userId,
      },
      now,
    );
    // The member, or every seated member of the group (sprint 6b).
    const members = await tx
      .select({ studentId: enrollments.studentId })
      .from(enrollments)
      .where(
        enrollmentId
          ? eq(enrollments.id, enrollmentId)
          : and(
              eq(enrollments.runId, input.runId),
              inArray(enrollments.status, ['active', 'paused']),
            ),
      );
    await notify(
      tx,
      actor,
      members.map((m) => ({
        userId: m.studentId,
        kind: 'session_scheduled' as const,
        studentId: m.studentId,
        subjectId: sessionId,
        data: { at: scheduledAt.toISOString() },
      })),
      now,
    );
    return sessionId;
  });
  return writeResult(db, actor, id);
}

/**
 * Internal (scheduling, sprint 7): the session of a booking the actor approved. Same checks as
 * POST /sessions for one member; the scheduling module notifies the mentee.
 */
export async function insertBookedSession(
  tx: DbOrTx,
  actor: Actor,
  values: {
    enrollmentId: string;
    mentorId: string;
    scheduledAt: Date;
    durationMinutes: number;
    location: string | null;
  },
  now: Date,
): Promise<string> {
  assertStaff(actor);
  const { row, run } = await enrollmentForStaff(tx, actor, values.enrollmentId);
  if (!holdsSeat(row.status)) throw errors.conflict(M.notSeated);
  if (!isRunOpen(run.status)) throw errors.conflict(M.runClosed);
  return repo.insertSession(
    tx,
    {
      runId: run.id,
      enrollmentId: row.id,
      mentorId: values.mentorId,
      scheduledAt: values.scheduledAt,
      durationMinutes: values.durationMinutes,
      location: values.location,
      createdBy: actor.userId,
    },
    now,
  );
}

/** Internal (scheduling, sprint 7): the mentee cancelled a booked session in time. */
export async function cancelBookedSession(
  tx: DbOrTx,
  sessionId: string,
  reason: string,
  now: Date,
): Promise<void> {
  await repo.updateSession(tx, sessionId, { status: 'cancelled', cancelledReason: reason }, now);
}

/** PATCH /sessions/:id: reschedule, change mentor or place, or record the outcome. */
export async function updateSession(
  actor: Actor,
  id: string,
  input: UpdateSessionInput,
  db: Db = getDb(),
): Promise<SessionWriteDTO> {
  await db.transaction(async (tx) => {
    const row = await sessionForEdit(tx, actor, id);
    const values: Parameters<typeof repo.updateSession>[2] = {};
    if (input.mentorId !== undefined && input.mentorId !== row.mentorId) {
      await assertMentor(tx, actor, input.mentorId);
      values.mentorId = input.mentorId;
    }
    if (input.day !== undefined || input.time !== undefined) {
      const timeZone = await organizationTimeZone(tx, actor.organizationId);
      const was = partsIn(timeZone, row.scheduledAt);
      const day = input.day ?? dayIn(timeZone, row.scheduledAt);
      const [hour, minute] = input.time ? minutesOf(input.time) : [was.hour, was.minute];
      values.scheduledAt = dateTimeIn(timeZone, day, hour, minute);
    }
    if (input.durationMinutes !== undefined) values.durationMinutes = input.durationMinutes;
    if (input.location !== undefined) values.location = input.location;
    if (input.countsTowardQuota !== undefined) values.countsTowardQuota = input.countsTowardQuota;
    if (input.status !== undefined) values.status = input.status;
    const status = input.status ?? row.status;
    if (status === 'cancelled') {
      if (input.cancelledReason !== undefined) values.cancelledReason = input.cancelledReason;
    } else if (row.cancelledReason !== null || input.cancelledReason !== undefined) {
      values.cancelledReason = null;
    }
    await repo.updateSession(tx, row.id, values, new Date());
  });
  return writeResult(db, actor, id);
}

/**
 * POST /sessions/:id/actions: a "next action" as a task for the member — for a group session,
 * for `studentId`, who must hold a seat in the run.
 */
export async function addSessionAction(
  actor: Actor,
  id: string,
  input: SessionActionInput,
  db: Db = getDb(),
): Promise<SessionDTO> {
  await db.transaction(async (tx) => {
    const row = await sessionForEdit(tx, actor, id);
    let studentId: string;
    let enrollmentId: string | null;
    if (row.enrollmentId && row.studentId) {
      if (input.studentId !== undefined && input.studentId !== row.studentId) {
        throw errors.validation({ studentId: INVALID });
      }
      studentId = row.studentId;
      enrollmentId = row.enrollmentId;
    } else {
      if (!input.studentId) throw errors.validation({ studentId: M.actionNeedsStudent });
      enrollmentId = await repo.seatedMember(tx, row.runId, input.studentId);
      if (!enrollmentId) throw errors.validation({ studentId: M.memberNotInRun });
      studentId = input.studentId;
    }
    await insertSessionAction(
      tx,
      actor,
      {
        title: input.title,
        description: input.description ?? null,
        dueDay: input.dueDate,
        studentId,
        enrollmentId,
        sessionId: row.id,
        reviewerId: row.mentorId,
      },
      new Date(),
    );
  });
  return sessionDTO(db, actor, id);
}

// ---- goals ----------------------------------------------------------------------------------

function toGoalDTO(g: repo.GoalRow): GoalDTO {
  return {
    id: g.id,
    enrollmentId: g.enrollmentId,
    title: g.title,
    description: g.description,
    targetDate: g.targetDate,
    status: g.status,
    decidedAt: g.decidedAt?.toISOString() ?? null,
  };
}

/** GET /enrollments/:id/goals: staff who may act on the enrollment, or the mentee (own). */
export async function listGoals(
  actor: Actor,
  enrollmentId: string,
  db: DbOrTx = getDb(),
): Promise<GoalListDTO> {
  if (actor.role === 'student') {
    const own = await repo.ownEnrollments(db, actor.organizationId, actor.userId);
    if (!own.some((e) => e.id === enrollmentId)) throw errors.notFound();
    return {
      goals: (await repo.listGoals(db, [enrollmentId])).map(toGoalDTO),
      can: { edit: false },
    };
  }
  const { row } = await enrollmentForStaff(db, actor, enrollmentId);
  return { goals: (await repo.listGoals(db, [row.id])).map(toGoalDTO), can: { edit: true } };
}

/** The mentee's goals across their enrollments (for «my programs»). */
export async function listMyGoals(actor: Actor, db: DbOrTx = getDb()): Promise<GoalDTO[]> {
  if (actor.role !== 'student') throw errors.forbidden();
  const own = await repo.ownEnrollments(db, actor.organizationId, actor.userId);
  return (
    await repo.listGoals(
      db,
      own.map((e) => e.id),
    )
  ).map(toGoalDTO);
}

/** POST /enrollments/:id/goals (staff). */
export async function createGoal(
  actor: Actor,
  enrollmentId: string,
  input: CreateGoalInput,
  db: Db = getDb(),
): Promise<GoalDTO> {
  return db.transaction(async (tx) => {
    const { row } = await enrollmentForStaff(tx, actor, enrollmentId, true);
    if (row.status === 'dropped') throw errors.conflict(M.notSeated);
    const goal = await repo.insertGoal(
      tx,
      {
        enrollmentId: row.id,
        title: input.title,
        description: input.description ?? null,
        targetDate: input.targetDate ?? null,
        createdBy: actor.userId,
      },
      new Date(),
    );
    return toGoalDTO(goal);
  });
}

/** PATCH /goals/:id (staff): edit, or mark achieved, dropped or open again. */
export async function updateGoal(
  actor: Actor,
  id: string,
  input: UpdateGoalInput,
  db: Db = getDb(),
): Promise<GoalDTO> {
  assertStaff(actor);
  return db.transaction(async (tx) => {
    if (!isUuid(id)) throw errors.notFound();
    const goal = await repo.findGoal(tx, actor.organizationId, id);
    if (!goal) throw errors.notFound();
    await enrollmentForStaff(tx, actor, goal.enrollmentId);
    const now = new Date();
    const values: Parameters<typeof repo.updateGoal>[2] = {};
    if (input.title !== undefined) values.title = input.title;
    if (input.description !== undefined) values.description = input.description;
    if (input.targetDate !== undefined) values.targetDate = input.targetDate;
    if (input.status !== undefined && input.status !== goal.status) {
      values.status = input.status;
      values.decidedAt = input.status === 'open' ? null : now;
      values.decidedBy = input.status === 'open' ? null : actor.userId;
    }
    return toGoalDTO(await repo.updateGoal(tx, goal.id, values, now));
  });
}

/** Staff «today»: the actor's sessions from now to `days` days ahead (sprint 5b). */
export async function upcomingSessionsFor(
  actor: Actor,
  now: Date,
  days = 7,
  db: DbOrTx = getDb(),
): Promise<SessionDTO[]> {
  const until = new Date(now.getTime() + days * 86_400_000);
  const list = await listSessions(actor, { when: 'upcoming' }, now, db);
  return list.filter((s) => new Date(s.scheduledAt) < until);
}
