import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { inheritedOrganizationId, users } from '../identity/schema';
import { students } from '../students/schema';

/**
 * health — manual flags (R-FLAG) and the current health of each student (data-model.md
 * 2-11, ADR-0005). The student NEVER sees anything from these tables (ADR-0004 section 3):
 * no student route or DTO reads them.
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const FLAG_CATEGORIES = [
  'financial',
  'platform_access',
  'personal',
  'language',
  'other',
] as const;
export const FLAG_LEVELS = ['yellow', 'red'] as const;
export const HEALTH_STATUSES = ['green', 'yellow', 'red', 'paused', 'untracked'] as const;

const ts = () => timestamp({ withTimezone: true });
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** Active flag: `cleared_at IS NULL AND (expires_at IS NULL OR expires_at > now())`. */
export const studentFlags = pgTable(
  'student_flags',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    category: text({ enum: FLAG_CATEGORIES }).notNull(),
    level: text({ enum: FLAG_LEVELS }).notNull(),
    note: text(),
    expiresAt: ts(),
    clearedAt: ts(),
    clearedBy: uuid().references(() => users.id),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('student_flags_student_idx').on(t.studentId).where(sql`${t.clearedAt} IS NULL`),
    check('student_flags_category_check', sql`${t.category} IN (${inList(FLAG_CATEGORIES)})`),
    check('student_flags_level_check', sql`${t.level} IN (${inList(FLAG_LEVELS)})`),
  ],
);

/** Rule result stored per student; `facts` are raw numbers, the UI builds the sentence. */
export type StoredHealthReason = {
  rule: string;
  level: 'yellow' | 'red';
  ball: 'student' | 'team' | 'both' | null;
  facts: Record<string, number | string | string[]>;
};

/** One row per student (upserted by every recompute). */
export const studentHealth = pgTable(
  'student_health',
  {
    organizationId: inheritedOrganizationId(),
    studentId: uuid()
      .primaryKey()
      .references(() => students.userId),
    status: text({ enum: HEALTH_STATUSES }).notNull(),
    reasons: jsonb().$type<StoredHealthReason[]>().notNull().default([]),
    churnRisk: boolean().notNull().default(false),
    /** Since when in this status (sorting by «oldest»). */
    statusSince: ts().notNull(),
    /** Base of the team rule «red without action». */
    redSince: ts(),
    computedAt: ts().notNull(),
    /** Version of `settings['health.rules']` used (0 = built-in default). */
    settingsVersion: integer().notNull().default(0),
    /** "Snooze until a date" (F7): hidden from stuck lists until then; computing continues. */
    snoozedUntil: ts(),
    snoozeReason: text(),
    snoozedBy: uuid().references(() => users.id),
  },
  (t) => [
    index('student_health_status_idx').on(t.status, t.statusSince),
    check('student_health_status_check', sql`${t.status} IN (${inList(HEALTH_STATUSES)})`),
    check(
      'student_health_red_since_check',
      sql`(${t.status} = 'red') = (${t.redSince} IS NOT NULL)`,
    ),
  ],
);
