import { and, asc, desc, eq, gte, isNull, like, lt, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/server/db';
import { users } from '../identity/schema';
import { students } from '../students/schema';
import type { ReminderStatus } from './contracts';
import { reminders } from './schema';

/**
 * reminders — queries (only used inside the module, and by the `today` read-model through
 * the service). Columns are explicit (SEC-A9). Display JOINs are read-only.
 */

const ownerUsers = alias(users, 'owner_users');
const studentUsers = alias(users, 'reminder_student_users');

const columns = {
  id: reminders.id,
  ownerId: reminders.ownerId,
  ownerDisplayName: ownerUsers.displayName,
  studentId: reminders.studentId,
  studentDisplayName: studentUsers.displayName,
  text: reminders.text,
  dueAt: reminders.dueAt,
  status: reminders.status,
  doneAt: reminders.doneAt,
  snoozeCount: reminders.snoozeCount,
  source: reminders.source,
  createdAt: reminders.createdAt,
  updatedAt: reminders.updatedAt,
};

function baseQuery(db: DbOrTx) {
  return db
    .select(columns)
    .from(reminders)
    .innerJoin(ownerUsers, eq(ownerUsers.id, reminders.ownerId))
    .leftJoin(students, eq(students.userId, reminders.studentId))
    .leftJoin(studentUsers, eq(studentUsers.id, reminders.studentId));
}

export type ReminderRow = NonNullable<Awaited<ReturnType<typeof findReminder>>>;

export async function findReminder(db: DbOrTx, id: string) {
  const [row] = await baseQuery(db).where(eq(reminders.id, id));
  return row ?? null;
}

/** Lock + the scope inputs (owner, student's primary mentor). */
export async function lockReminder(db: DbOrTx, id: string) {
  const [row] = await db
    .select({
      id: reminders.id,
      ownerId: reminders.ownerId,
      studentId: reminders.studentId,
      primaryMentorId: students.primaryMentorId,
      status: reminders.status,
      dueAt: reminders.dueAt,
    })
    .from(reminders)
    .leftJoin(students, eq(students.userId, reminders.studentId))
    .where(eq(reminders.id, id))
    .for('update', { of: reminders });
  return row ?? null;
}

export type ListFilter = {
  /** `students.primary_mentor_id` scope (SEC-A2); reminders without a student pass. */
  scope: (column: typeof students.primaryMentorId) => SQL;
  ownerId?: string;
  studentId?: string;
  window: { kind: 'before'; at: Date } | { kind: 'from'; at: Date } | { kind: 'done' };
};

export async function listReminders(db: DbOrTx, filter: ListFilter) {
  const conditions: SQL[] = [];
  const scoped = or(isNull(reminders.studentId), filter.scope(students.primaryMentorId));
  if (scoped) conditions.push(scoped);
  if (filter.ownerId) conditions.push(eq(reminders.ownerId, filter.ownerId));
  if (filter.studentId) conditions.push(eq(reminders.studentId, filter.studentId));
  if (filter.window.kind === 'done') {
    conditions.push(eq(reminders.status, 'done'));
    return baseQuery(db)
      .where(and(...conditions))
      .orderBy(desc(reminders.doneAt), desc(reminders.id))
      .limit(100);
  }
  conditions.push(eq(reminders.status, 'open'));
  conditions.push(
    filter.window.kind === 'before'
      ? lt(reminders.dueAt, filter.window.at)
      : gte(reminders.dueAt, filter.window.at),
  );
  return baseQuery(db)
    .where(and(...conditions))
    .orderBy(asc(reminders.dueAt), asc(reminders.id))
    .limit(500);
}

export async function insertReminder(
  db: DbOrTx,
  values: {
    ownerId: string;
    studentId: string | null;
    text: string;
    dueAt: Date;
    createdBy: string;
  },
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(reminders)
    .values({ ...values, status: 'open', source: 'manual', createdAt: now, updatedAt: now })
    .returning({ id: reminders.id });
  if (!row) throw new Error('insertReminder returned no row');
  return row.id;
}

export async function updateReminder(
  db: DbOrTx,
  id: string,
  values: Partial<{
    text: string;
    dueAt: Date;
    status: ReminderStatus;
    doneAt: Date | null;
    snoozeCount: SQL;
  }>,
  now: Date,
): Promise<void> {
  await db
    .update(reminders)
    .set({ ...values, updatedAt: now })
    .where(eq(reminders.id, id));
}

export const plusOne = sql`${reminders.snoozeCount} + 1`;

/** ADR-0004 section 2: open reminders about a student follow the new primary mentor. */
export async function transferOpen(
  db: DbOrTx,
  studentId: string,
  fromOwnerId: string,
  toOwnerId: string,
  now: Date,
): Promise<number> {
  const rows = await db
    .update(reminders)
    .set({ ownerId: toOwnerId, updatedAt: now })
    .where(
      and(
        eq(reminders.studentId, studentId),
        eq(reminders.ownerId, fromOwnerId),
        eq(reminders.status, 'open'),
      ),
    )
    .returning({ id: reminders.id });
  return rows.length;
}

/** Idempotent system reminder: re-opened (and re-timed) if the key already exists. */
export async function upsertSystemReminder(
  db: DbOrTx,
  values: {
    systemKey: string;
    ownerId: string;
    studentId: string;
    text: string;
    dueAt: Date;
    createdBy: string;
  },
  now: Date,
): Promise<void> {
  await db
    .insert(reminders)
    .values({ ...values, status: 'open', source: 'system', createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: reminders.systemKey,
      set: {
        status: 'open',
        doneAt: null,
        ownerId: values.ownerId,
        dueAt: values.dueAt,
        text: values.text,
        updatedAt: now,
      },
    });
}

export async function cancelOpenSystemReminders(
  db: DbOrTx,
  keyPrefix: string,
  now: Date,
): Promise<void> {
  const escaped = keyPrefix.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  await db
    .update(reminders)
    .set({ status: 'cancelled', updatedAt: now })
    .where(
      and(
        eq(reminders.source, 'system'),
        eq(reminders.status, 'open'),
        like(reminders.systemKey, `${escaped}%`),
      ),
    );
}
