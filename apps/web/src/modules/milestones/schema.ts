import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { milestoneTypes, platforms } from '../catalog/schema';
import { inheritedOrganizationId, users } from '../identity/schema';
import { students } from '../students/schema';

/**
 * milestones — real-world results (PRD F9, data-model.md 2-10). A student proposes
 * (`proposed`, with evidence); a mentor or admin approves or rejects. Staff-recorded ones
 * are `approved` at once. Only approved milestones of a type with `counts_for_north_star`
 * count for the North Star.
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const MILESTONE_STATUSES = ['proposed', 'approved', 'rejected'] as const;

const ts = () => timestamp({ withTimezone: true });
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const milestones = pgTable(
  'milestones',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    typeId: uuid()
      .notNull()
      .references(() => milestoneTypes.id),
    /** Tehran calendar day of the event. */
    occurredOn: date({ mode: 'string' }).notNull(),
    platformId: uuid().references(() => platforms.id),
    amount: numeric({ precision: 12, scale: 2 }),
    currency: char({ length: 3 }),
    evidenceText: text(),
    status: text({ enum: MILESTONE_STATUSES }).notNull(),
    proposedBy: uuid()
      .notNull()
      .references(() => users.id),
    decidedBy: uuid().references(() => users.id),
    decidedAt: ts(),
    rejectionReason: text(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('milestones_student_idx').on(t.studentId, t.occurredOn),
    index('milestones_status_type_idx').on(t.status, t.typeId),
    check('milestones_status_check', sql`${t.status} IN (${inList(MILESTONE_STATUSES)})`),
    check('milestones_amount_check', sql`${t.amount} IS NULL OR ${t.amount} >= 0`),
    check(
      'milestones_rejection_check',
      sql`${t.status} <> 'rejected' OR ${t.rejectionReason} IS NOT NULL`,
    ),
  ],
);
