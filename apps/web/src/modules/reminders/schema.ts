import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { users } from '../identity/schema';
import { students } from '../students/schema';

/**
 * reminders — follow-ups that show up in "today" (data-model.md 2-7, PRD F6).
 * "Today" = `status = 'open' AND due_at < end of today in Tehran` (past ones included);
 * no job is needed. System reminders (e.g. return from a pause) have a unique
 * `system_key` so they are never duplicated.
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const REMINDER_STATUSES = ['open', 'done', 'cancelled'] as const;
export const REMINDER_SOURCES = ['manual', 'system'] as const;

const ts = () => timestamp({ withTimezone: true });

export const reminders = pgTable(
  'reminders',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** Who sees it in "today" (admin or mentor). */
    ownerId: uuid()
      .notNull()
      .references(() => users.id),
    /** About which student (optional). */
    studentId: uuid().references(() => students.userId),
    text: text().notNull(),
    dueAt: ts().notNull(),
    status: text({ enum: REMINDER_STATUSES }).notNull().default('open'),
    doneAt: ts(),
    snoozeCount: integer().notNull().default(0),
    source: text({ enum: REMINDER_SOURCES }).notNull().default('manual'),
    /** e.g. `pause-return:<studentId>:<date>`. */
    systemKey: text(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('reminders_owner_status_due_idx').on(t.ownerId, t.status, t.dueAt),
    index('reminders_student_idx').on(t.studentId),
    uniqueIndex('reminders_system_key_key').on(t.systemKey),
    check('reminders_status_check', sql`${t.status} IN ('open', 'done', 'cancelled')`),
    check('reminders_source_check', sql`${t.source} IN ('manual', 'system')`),
    check('reminders_done_check', sql`(${t.status} = 'done') = (${t.doneAt} IS NOT NULL)`),
    check(
      'reminders_system_key_check',
      sql`(${t.source} = 'system') = (${t.systemKey} IS NOT NULL)`,
    ),
    check('reminders_snooze_check', sql`${t.snoozeCount} >= 0`),
    check('reminders_text_check', sql`btrim(${t.text}) <> ''`),
  ],
);
