import { and, asc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/server/db';
import { users } from '../identity/schema';
import { students } from '../students/schema';
import { tasks } from '../tasks/schema';
import { type MessageLink, questionMessages, questionThreads } from './schema';

/**
 * questions — queries (only used inside the module; ADR-0004 scope conditions come from the
 * caller). Read-only JOINs to users (names), students (scope root) and tasks (title).
 */

const studentUsers = alias(users, 'q_student_users');
const assigneeUsers = alias(users, 'q_assignee_users');

const messageCount = sql<number>`(SELECT count(*)::int FROM ${questionMessages} WHERE ${questionMessages.threadId} = ${questionThreads.id})`;

const threadColumns = {
  id: questionThreads.id,
  studentId: questionThreads.studentId,
  studentDisplayName: studentUsers.displayName,
  primaryMentorId: students.primaryMentorId,
  subject: questionThreads.subject,
  status: questionThreads.status,
  awaiting: questionThreads.awaiting,
  awaitingTeamSince: questionThreads.awaitingTeamSince,
  assigneeId: questionThreads.assigneeId,
  assigneeDisplayName: assigneeUsers.displayName,
  taskId: questionThreads.taskId,
  taskTitle: tasks.title,
  priority: questionThreads.priority,
  source: questionThreads.source,
  firstResponseAt: questionThreads.firstResponseAt,
  lastMessageAt: questionThreads.lastMessageAt,
  closedAt: questionThreads.closedAt,
  createdAt: questionThreads.createdAt,
  updatedAt: questionThreads.updatedAt,
  messageCount,
};

function baseThreadQuery(db: DbOrTx) {
  return db
    .select(threadColumns)
    .from(questionThreads)
    .innerJoin(students, eq(students.userId, questionThreads.studentId))
    .innerJoin(studentUsers, eq(studentUsers.id, questionThreads.studentId))
    .innerJoin(assigneeUsers, eq(assigneeUsers.id, questionThreads.assigneeId))
    .leftJoin(tasks, eq(tasks.id, questionThreads.taskId));
}

export type ThreadRow = NonNullable<Awaited<ReturnType<typeof findThread>>>;

export async function findThread(db: DbOrTx, id: string) {
  const [row] = await baseThreadQuery(db).where(eq(questionThreads.id, id));
  return row ?? null;
}

export async function lockThread(db: DbOrTx, id: string) {
  const [row] = await db
    .select({
      id: questionThreads.id,
      studentId: questionThreads.studentId,
      status: questionThreads.status,
      awaitingTeamSince: questionThreads.awaitingTeamSince,
      assigneeId: questionThreads.assigneeId,
      firstResponseAt: questionThreads.firstResponseAt,
    })
    .from(questionThreads)
    .where(eq(questionThreads.id, id))
    .for('update');
  return row ?? null;
}

/**
 * Staff visibility: inside the scope, OR assigned to `assigneeId` while open/answered
 * (ADR-0004 «نکته‌ی سؤال‌ها»).
 */
export function staffVisibility(scope: SQL, assigneeId: string): SQL {
  return (
    or(
      scope,
      and(
        eq(questionThreads.assigneeId, assigneeId),
        inArray(questionThreads.status, ['open', 'answered']),
      ),
    ) ?? scope
  );
}

/** Awaiting the team first (oldest SLA start first), then the most recent activity. */
const staffOrder = [
  sql`CASE ${questionThreads.awaiting} WHEN 'team' THEN 0 ELSE 1 END`,
  sql`${questionThreads.awaitingTeamSince} ASC NULLS LAST`,
  sql`${questionThreads.lastMessageAt} DESC NULLS LAST`,
  asc(questionThreads.id),
];

export async function listThreads(db: DbOrTx, conditions: SQL[], limit: number, offset: number) {
  return baseThreadQuery(db)
    .where(and(...conditions))
    .orderBy(...staffOrder)
    .limit(limit)
    .offset(offset);
}

export async function listThreadsOfStudent(db: DbOrTx, studentId: string, status?: string) {
  const conditions: SQL[] = [eq(questionThreads.studentId, studentId)];
  if (status) conditions.push(sql`${questionThreads.status} = ${status}`);
  return baseThreadQuery(db)
    .where(and(...conditions))
    .orderBy(sql`${questionThreads.lastMessageAt} DESC NULLS LAST`, asc(questionThreads.id));
}

export async function insertThread(
  db: DbOrTx,
  values: {
    studentId: string;
    subject: string;
    assigneeId: string;
    taskId: string | null;
    priority: 'normal' | 'urgent';
    source: 'student' | 'checkin';
  },
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(questionThreads)
    .values({
      ...values,
      status: 'open',
      awaiting: 'team',
      awaitingTeamSince: now,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: questionThreads.id });
  if (!row) throw new Error('insertThread returned no row');
  return row.id;
}

export type ThreadUpdate = Partial<{
  status: 'open' | 'answered' | 'closed';
  awaiting: 'team' | 'student' | 'none';
  awaitingTeamSince: Date | null;
  firstResponseAt: Date;
  lastMessageAt: Date;
  closedAt: Date | null;
  closedBy: string | null;
  assigneeId: string;
}>;

export async function updateThread(
  db: DbOrTx,
  id: string,
  values: ThreadUpdate,
  now: Date,
): Promise<void> {
  await db
    .update(questionThreads)
    .set({ ...values, updatedAt: now })
    .where(eq(questionThreads.id, id));
}

export async function insertMessage(
  db: DbOrTx,
  values: {
    threadId: string;
    authorId: string;
    body: string;
    links: MessageLink[];
    cannedResponseId: string | null;
  },
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(questionMessages)
    .values({ ...values, createdAt: now })
    .returning({ id: questionMessages.id });
  if (!row) throw new Error('insertMessage returned no row');
  return row.id;
}

export async function listMessages(db: DbOrTx, threadId: string) {
  return db
    .select({
      id: questionMessages.id,
      authorId: questionMessages.authorId,
      authorDisplayName: users.displayName,
      authorRole: users.role,
      body: questionMessages.body,
      links: questionMessages.links,
      cannedResponseId: questionMessages.cannedResponseId,
      createdAt: questionMessages.createdAt,
      editedAt: questionMessages.editedAt,
    })
    .from(questionMessages)
    .innerJoin(users, eq(users.id, questionMessages.authorId))
    .where(eq(questionMessages.threadId, threadId))
    .orderBy(asc(questionMessages.createdAt), asc(questionMessages.id));
}

/** Active admin to receive a question when the student has no (active) primary mentor. */
export async function firstActiveAdmin(db: DbOrTx): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);
  return row?.id ?? null;
}
