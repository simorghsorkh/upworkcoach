import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { organizationId, users } from '../identity/schema';

/**
 * notifications — in-app notices (Coach Office sprint 6b; no SMS or email). One row per
 * recipient. The other modules call `notify()` inside their own transaction after their write;
 * the text is rendered from the message catalog by `kind`, so a row holds only references and
 * the few values the text needs (`data.title`, `data.outcome`, `data.at`). Relative imports
 * only (drizzle-kit).
 */

export const NOTIFICATION_KINDS = [
  /** To the mentee: a new task (staff, program assignment or a session's next action). */
  'task_assigned',
  /** To the mentee: their submission was accepted or sent back (`data.outcome`). */
  'task_reviewed',
  /** To the task's reviewer: the mentee submitted. */
  'task_submitted',
  /** To the thread's assignee: a mentee asked or wrote again. */
  'question_new',
  /** To the mentee: the team answered. */
  'question_reply',
  /** To the mentee (or every seated member of a group): a session was scheduled (`data.at`). */
  'session_scheduled',
  /** To the mentor (and the admins when the mentee has no package): a booking request (sprint 7). */
  'booking_requested',
  /** To the mentee: the mentor approved or declined their request (`data.outcome`). */
  'booking_decided',
  /** To the mentor: the mentee cancelled a request or a booked session. */
  'booking_cancelled',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationData = {
  title?: string;
  outcome?: 'accepted' | 'changes_requested' | 'approved' | 'declined';
  /** ISO time of a session. */
  at?: string;
};

const ts = () => timestamp({ withTimezone: true });
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const notifications = pgTable(
  'notifications',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    /** Recipient. */
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text({ enum: NOTIFICATION_KINDS }).notNull(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** The mentee it is about; erasing the mentee removes the row (ADR-0010). */
    studentId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    /** Task, question thread or session id (by `kind`). */
    subjectId: uuid(),
    data: jsonb().$type<NotificationData>().notNull().default({}),
    readAt: ts(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.organizationId, t.createdAt),
    index('notifications_unread_idx')
      .on(t.userId, t.organizationId)
      .where(sql`${t.readAt} IS NULL`),
    index('notifications_student_idx').on(t.studentId),
    check('notifications_kind_check', sql`${t.kind} IN (${inList(NOTIFICATION_KINDS)})`),
  ],
);
