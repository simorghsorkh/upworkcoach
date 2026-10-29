import { addDays, tehranDateTime, tehranDay, tehranDayRange } from '@/lib/tehran-day';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { ApiError, errors } from '@/server/http/errors';
import { assertRefs, type RefCheck } from '../access/refs';
import { scopeCondition, staffStudentScope, studentInScope } from '../access/scope';
import type {
  CreateReminderInput,
  ListRemindersQuery,
  ReminderDTO,
  UpdateReminderInput,
} from './contracts';
import * as repo from './repo';

/**
 * reminders — follow-ups for "today" (PRD F6, api.md section 8, ADR-0004 table).
 * A mentor works only with their OWN reminders, about students in their CURRENT scope (or
 * about nobody). An admin may create reminders for any active admin/mentor and edit all.
 * Missing and not-allowed reminders give the same 404.
 */

/** Default time of a reminder given as a day: 09:00 Tehran (data-model.md 2-7). */
export const DEFAULT_REMINDER_HOUR = 9;
const DAY_MS = 24 * 3600 * 1000;

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

export function dueFrom(input: { dueAt?: Date; dueDate?: string }): Date | undefined {
  if (input.dueAt) return input.dueAt;
  if (input.dueDate) return tehranDateTime(input.dueDate, DEFAULT_REMINDER_HOUR);
  return undefined;
}

/** Snooze base: the later of now and the current due time (pure; unit-tested). */
export function snoozedDueAt(current: Date, days: number, now: Date): Date {
  return new Date(Math.max(current.getTime(), now.getTime()) + days * DAY_MS);
}

export function toReminderDTO(row: repo.ReminderRow, now: Date = new Date()): ReminderDTO {
  return {
    id: row.id,
    text: row.text,
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    overdue: row.status === 'open' && row.dueAt.getTime() < now.getTime(),
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
    snoozeCount: row.snoozeCount,
    source: row.source,
    student:
      row.studentId && row.studentDisplayName
        ? { id: row.studentId, displayName: row.studentDisplayName }
        : null,
    owner: { id: row.ownerId, displayName: row.ownerDisplayName },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadDTO(db: DbOrTx, id: string): Promise<ReminderDTO> {
  const row = await repo.findReminder(db, id);
  if (!row) throw errors.notFound();
  return toReminderDTO(row);
}

/**
 * Reminder rows visible to the actor (SEC-A2: scope in SQL). Mentors: own only; admins:
 * `ownerId` filter, or everybody when `ownerId` is `'all'`.
 */
async function listFor(
  db: DbOrTx,
  actor: Actor,
  options: {
    ownerId: string | 'all';
    studentId?: string;
    window: repo.ListFilter['window'];
  },
) {
  const scope = await staffStudentScope(db, actor);
  const ownerId =
    actor.role === 'mentor'
      ? actor.userId
      : options.ownerId === 'all'
        ? undefined
        : options.ownerId;
  if (actor.role === 'mentor' && options.ownerId !== 'all' && options.ownerId !== actor.userId) {
    return [];
  }
  return repo.listReminders(db, {
    organizationId: actor.organizationId,
    scope: (student, organization) => scopeCondition(scope, student, organization),
    ownerId,
    studentId: options.studentId,
    window: options.window,
  });
}

/** GET /reminders (A, M). */
export async function listReminders(
  actor: Actor,
  query: ListRemindersQuery = {},
  db: DbOrTx = getDb(),
): Promise<ReminderDTO[]> {
  assertStaff(actor);
  const now = new Date();
  const { end } = tehranDayRange(now);
  const scope = query.scope ?? 'today';
  const rows = await listFor(db, actor, {
    ownerId: query.ownerId ?? actor.userId,
    studentId: query.studentId,
    window:
      scope === 'done'
        ? { kind: 'done' }
        : scope === 'today'
          ? { kind: 'before', at: end }
          : { kind: 'from', at: end },
  });
  return rows.map((r) => toReminderDTO(r, now));
}

/** POST /reminders (A, M). */
export async function createReminder(
  actor: Actor,
  input: CreateReminderInput,
  db: Db = getDb(),
): Promise<ReminderDTO> {
  assertStaff(actor);
  const dueAt = dueFrom(input);
  if (!dueAt) throw errors.validation({ dueDate: 'روز یادآور را انتخاب کن.' });
  return db.transaction(async (tx) => {
    const ownerId = input.ownerId ?? actor.userId;
    const refs: RefCheck[] = [
      { field: 'ownerId', kind: 'staffUser', id: ownerId, mentorActorMustBeSelf: true },
    ];
    if (input.studentId) {
      refs.push({ field: 'studentId', kind: 'studentsInScope', ids: [input.studentId] });
    }
    await assertRefs(tx, actor, refs);
    const id = await repo.insertReminder(
      tx,
      {
        organizationId: actor.organizationId,
        ownerId,
        studentId: input.studentId ?? null,
        text: input.text,
        dueAt,
        createdBy: actor.userId,
      },
      new Date(),
    );
    return loadDTO(tx, id);
  });
}

/** Owner (with the student in the current scope) or admin; otherwise 404. */
async function lockForWrite(tx: DbOrTx, actor: Actor, reminderId: string) {
  assertStaff(actor);
  if (!isUuid(reminderId)) throw errors.notFound();
  const row = await repo.lockReminder(tx, actor.organizationId, reminderId);
  if (!row) throw errors.notFound();
  if (actor.role === 'admin') return row;
  if (row.ownerId !== actor.userId) throw errors.notFound();
  if (row.studentId) {
    const scope = await staffStudentScope(tx, actor);
    if (!(await studentInScope(tx, scope, row.studentId, row.organizationId))) {
      throw errors.notFound();
    }
  }
  return row;
}

const NOT_OPEN = 'این یادآور دیگر باز نیست.';

/** PATCH /reminders/:id (owner, A): text and/or due time of an open reminder. */
export async function updateReminder(
  actor: Actor,
  reminderId: string,
  input: UpdateReminderInput,
  db: Db = getDb(),
): Promise<ReminderDTO> {
  return db.transaction(async (tx) => {
    const row = await lockForWrite(tx, actor, reminderId);
    if (row.status !== 'open') throw new ApiError('CONFLICT', { message: NOT_OPEN });
    const values: Parameters<typeof repo.updateReminder>[2] = {};
    if (input.text !== undefined) values.text = input.text;
    const dueAt = dueFrom(input);
    if (dueAt) values.dueAt = dueAt;
    if (Object.keys(values).length > 0) {
      await repo.updateReminder(tx, reminderId, values, new Date());
    }
    return loadDTO(tx, reminderId);
  });
}

/** POST /reminders/:id/done (owner, A). Done twice is fine (idempotent). */
export async function completeReminder(
  actor: Actor,
  reminderId: string,
  db: Db = getDb(),
): Promise<ReminderDTO> {
  return db.transaction(async (tx) => {
    const row = await lockForWrite(tx, actor, reminderId);
    if (row.status === 'cancelled') throw new ApiError('CONFLICT', { message: NOT_OPEN });
    if (row.status === 'open') {
      const now = new Date();
      await repo.updateReminder(tx, reminderId, { status: 'done', doneAt: now }, now);
    }
    return loadDTO(tx, reminderId);
  });
}

/** POST /reminders/:id/snooze (owner, A): 1, 3 or 7 days from max(now, due time). */
export async function snoozeReminder(
  actor: Actor,
  reminderId: string,
  input: { days: number },
  db: Db = getDb(),
): Promise<ReminderDTO> {
  return db.transaction(async (tx) => {
    const row = await lockForWrite(tx, actor, reminderId);
    if (row.status !== 'open') throw new ApiError('CONFLICT', { message: NOT_OPEN });
    const now = new Date();
    await repo.updateReminder(
      tx,
      reminderId,
      { dueAt: snoozedDueAt(row.dueAt, input.days, now), snoozeCount: repo.plusOne },
      now,
    );
    return loadDTO(tx, reminderId);
  });
}

/** DELETE /reminders/:id (owner, A): → `cancelled` (204). */
export async function cancelReminder(
  actor: Actor,
  reminderId: string,
  db: Db = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockForWrite(tx, actor, reminderId);
    if (row.status === 'open') {
      const now = new Date();
      await repo.updateReminder(tx, reminderId, { status: 'cancelled' }, now);
    }
  });
}

// ---- internal (other modules' services; no actor) --------------------------------------

/**
 * «امروز»: open reminders due before the end of today (Tehran), past ones included.
 * Mentor: own. Admin: `mentorId` → that owner; otherwise everybody's (F6 «مدیر همه را با
 * فیلتر مشاور»). The caller already checked the role.
 */
export async function remindersForToday(
  db: DbOrTx,
  actor: Actor,
  mentorId: string | undefined,
  now: Date,
): Promise<ReminderDTO[]> {
  const { end } = tehranDayRange(now);
  const rows = await listFor(db, actor, {
    ownerId: actor.role === 'mentor' ? actor.userId : (mentorId ?? 'all'),
    window: { kind: 'before', at: end },
  });
  return rows.map((r) => toReminderDTO(r, now));
}

/** Mentor change (ADR-0004 section 2): the old mentor's open reminders follow the student. */
export async function transferRemindersOnMentorChange(
  tx: DbOrTx,
  studentId: string,
  fromMentorId: string | null,
  toUserId: string,
  now: Date,
): Promise<void> {
  if (!fromMentorId || fromMentorId === toUserId) return;
  await repo.transferOpen(tx, studentId, fromMentorId, toUserId, now);
}

const pauseKeyPrefix = (studentId: string) => `pause-return:${studentId}:`;

/**
 * Pause (data-model.md 2-3): a system reminder for the primary mentor (or whoever paused the
 * student) at 09:00 Tehran one day before `pausedUntil`. Idempotent by `system_key`.
 */
export async function schedulePauseReturnReminder(
  tx: DbOrTx,
  input: { studentId: string; ownerId: string; pausedUntil: string; createdBy: string },
  now: Date,
): Promise<void> {
  await cancelPauseReturnReminders(tx, input.studentId, now);
  const day = addDays(input.pausedUntil, -1);
  const dueDay = day < tehranDay(now) ? tehranDay(now) : day;
  await repo.upsertSystemReminder(
    tx,
    {
      systemKey: `${pauseKeyPrefix(input.studentId)}${input.pausedUntil}`,
      ownerId: input.ownerId,
      studentId: input.studentId,
      text: 'دوره‌ی توقف این هنرجو فردا تمام می‌شود؛ برای برگشتش برنامه بگذار.',
      dueAt: tehranDateTime(dueDay, DEFAULT_REMINDER_HOUR),
      createdBy: input.createdBy,
    },
    now,
  );
}

/** Leaving `paused` (or pausing again) cancels the open return reminders. */
export async function cancelPauseReturnReminders(
  tx: DbOrTx,
  studentId: string,
  now: Date,
): Promise<void> {
  await repo.cancelOpenSystemReminders(tx, pauseKeyPrefix(studentId), now);
}
