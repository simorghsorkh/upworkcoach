import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { cannedResponses } from '../catalog/schema';
import { inheritedOrganizationId, users } from '../identity/schema';
import { students } from '../students/schema';
import { tasks } from '../tasks/schema';

/**
 * questions — asynchronous question threads (PRD F8, data-model.md 2-8). Transitions:
 *   student message → open, awaiting team (awaiting_team_since set if empty)
 *   team message    → answered, awaiting student (awaiting_team_since cleared)
 *   close           → closed, awaiting none; a later student message reopens it
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const QUESTION_STATUSES = ['open', 'answered', 'closed'] as const;
export const QUESTION_AWAITING = ['team', 'student', 'none'] as const;
export const QUESTION_PRIORITIES = ['normal', 'urgent'] as const;
export const QUESTION_SOURCES = ['student', 'checkin'] as const;

const ts = () => timestamp({ withTimezone: true });
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export type MessageLink = { url: string; label: string | null };

export const questionThreads = pgTable(
  'question_threads',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    subject: text().notNull(),
    status: text({ enum: QUESTION_STATUSES }).notNull().default('open'),
    /** «توپ در زمین کیست». */
    awaiting: text({ enum: QUESTION_AWAITING }).notNull().default('team'),
    /** Start of the SLA clock: set by a student message, cleared by a team reply. */
    awaitingTeamSince: ts(),
    /** Default: the primary mentor; without one, an admin. */
    assigneeId: uuid()
      .notNull()
      .references(() => users.id),
    /** A question about one task (e.g. «درخواست تمدید مهلت»). */
    taskId: uuid().references(() => tasks.id),
    priority: text({ enum: QUESTION_PRIORITIES }).notNull().default('normal'),
    source: text({ enum: QUESTION_SOURCES }).notNull().default('student'),
    firstResponseAt: ts(),
    lastMessageAt: ts(),
    closedAt: ts(),
    closedBy: uuid().references(() => users.id),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('question_threads_student_idx').on(t.studentId, t.lastMessageAt),
    index('question_threads_assignee_idx').on(t.assigneeId, t.status),
    index('question_threads_awaiting_team_idx')
      .on(t.awaitingTeamSince)
      .where(sql`${t.awaiting} = 'team'`),
    check('question_threads_status_check', sql`${t.status} IN (${inList(QUESTION_STATUSES)})`),
    check('question_threads_awaiting_check', sql`${t.awaiting} IN (${inList(QUESTION_AWAITING)})`),
    check(
      'question_threads_priority_check',
      sql`${t.priority} IN (${inList(QUESTION_PRIORITIES)})`,
    ),
    check('question_threads_source_check', sql`${t.source} IN (${inList(QUESTION_SOURCES)})`),
    check(
      'question_threads_closed_check',
      sql`(${t.status} = 'closed') = (${t.closedAt} IS NOT NULL)`,
    ),
  ],
);

export const questionMessages = pgTable(
  'question_messages',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    threadId: uuid()
      .notNull()
      .references(() => questionThreads.id),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    links: jsonb().$type<MessageLink[]>().notNull().default([]),
    /** Standard answer used (statistics only). */
    cannedResponseId: uuid().references(() => cannedResponses.id),
    createdAt: ts().notNull().defaultNow(),
    editedAt: ts(),
  },
  (t) => [index('question_messages_thread_idx').on(t.threadId, t.createdAt)],
);
