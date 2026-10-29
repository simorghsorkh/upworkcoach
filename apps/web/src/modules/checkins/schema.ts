import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { inheritedOrganizationId } from '../identity/schema';
import { questionThreads } from '../questions/schema';
import { students } from '../students/schema';

/**
 * checkins — the weekly check-in (progress-tracking.md 6-3, data-model.md 2-9; Should,
 * decision E5 = on). `week_start` is the Saturday of the Tehran week; one per week.
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

const ts = () => timestamp({ withTimezone: true });

export const checkins = pgTable(
  'checkins',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    weekStart: date({ mode: 'string' }).notNull(),
    activityText: text(),
    blocker: text(),
    /** 1..5 (base of R-MOOD). */
    mood: smallint().notNull(),
    nextWeekPlan: text(),
    needsHelp: boolean().notNull().default(false),
    /** The question opened by «به کمک مشاور نیاز دارم». */
    questionId: uuid().references(() => questionThreads.id),
    submittedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('checkins_student_week_key').on(t.studentId, t.weekStart),
    index('checkins_week_idx').on(t.weekStart),
    check('checkins_mood_check', sql`${t.mood} BETWEEN 1 AND 5`),
  ],
);
