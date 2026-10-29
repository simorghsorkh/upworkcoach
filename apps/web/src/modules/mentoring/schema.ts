import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { inheritedOrganizationId, users } from '../identity/schema';
import { enrollments, programRuns } from '../programs/schema';

/**
 * mentoring — sessions and goals (ADR-0012 sections 4, 6 and 7; Coach Office sprint 5b).
 *
 *   program_runs ─< mentoring_sessions   one member (enrollment_id) or the whole group (null)
 *   enrollments  ─< goals                the axis of one-on-one mentoring
 *
 * Package use = sessions of an enrollment that were held or missed and count toward the quota.
 * A session's "next actions" are tasks with `tasks.session_id` (tasks module). No price,
 * order or payment column anywhere (CLAUDE.md). Relative imports only (drizzle-kit).
 */

export const SESSION_STATUSES = ['scheduled', 'held', 'cancelled', 'no_show'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const GOAL_STATUSES = ['open', 'achieved', 'dropped'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

const ts = () => timestamp({ withTimezone: true });
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const mentoringSessions = pgTable(
  'mentoring_sessions',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: inheritedOrganizationId(),
    runId: uuid()
      .notNull()
      .references(() => programRuns.id, { onDelete: 'cascade' }),
    /** null = a group session of the whole run. */
    enrollmentId: uuid().references(() => enrollments.id, { onDelete: 'cascade' }),
    mentorId: uuid()
      .notNull()
      .references(() => users.id),
    /** UTC; shown in the organization's time zone (ADR-0013). */
    scheduledAt: ts().notNull(),
    durationMinutes: integer().notNull(),
    /** A meeting link (https only) or a place, as free text. */
    location: text(),
    status: text({ enum: SESSION_STATUSES }).notNull().default('scheduled'),
    /** Held and missed sessions use the package unless staff turn this off. */
    countsTowardQuota: boolean().notNull().default(true),
    cancelledReason: text(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('mentoring_sessions_run_idx').on(t.runId, t.scheduledAt),
    index('mentoring_sessions_mentor_idx').on(t.mentorId, t.scheduledAt),
    index('mentoring_sessions_enrollment_idx').on(t.enrollmentId),
    check('mentoring_sessions_status_check', sql`${t.status} IN (${inList(SESSION_STATUSES)})`),
    check(
      'mentoring_sessions_duration_check',
      sql`${t.durationMinutes} > 0 AND ${t.durationMinutes} <= 600`,
    ),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: inheritedOrganizationId(),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text(),
    targetDate: date({ mode: 'string' }),
    status: text({ enum: GOAL_STATUSES }).notNull().default('open'),
    /** When it was marked achieved or dropped, and by whom. */
    decidedAt: ts(),
    decidedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('goals_enrollment_idx').on(t.enrollmentId),
    check('goals_status_check', sql`${t.status} IN (${inList(GOAL_STATUSES)})`),
  ],
);
