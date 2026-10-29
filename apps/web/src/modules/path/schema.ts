import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { stages } from '../catalog/schema';
import { inheritedOrganizationId, users } from '../identity/schema';
import { students } from '../students/schema';

/**
 * path — stage history (data-model.md 2-4). The state of each stage (passed, current,
 * locked, …) is derived from this table and `stages.sort_order`; it is never stored.
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const TRANSITION_KINDS = [
  'initial',
  'advance',
  'skip_by_assessment',
  'advance_with_exception',
  'regress',
] as const;

export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export const stageTransitions = pgTable(
  'stage_transitions',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    /** null only for `initial`. */
    fromStageId: uuid().references(() => stages.id),
    toStageId: uuid()
      .notNull()
      .references(() => stages.id),
    kind: text({ enum: TRANSITION_KINDS }).notNull(),
    /** Required for `advance_with_exception` and `regress`. */
    note: text(),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stage_transitions_student_idx').on(t.studentId, t.createdAt),
    check(
      'stage_transitions_kind_check',
      sql`${t.kind} IN ('initial', 'advance', 'skip_by_assessment', 'advance_with_exception', 'regress')`,
    ),
    check(
      'stage_transitions_note_required',
      sql`${t.kind} NOT IN ('advance_with_exception', 'regress') OR (${t.note} IS NOT NULL AND btrim(${t.note}) <> '')`,
    ),
    check(
      'stage_transitions_from_check',
      sql`(${t.kind} = 'initial') = (${t.fromStageId} IS NULL)`,
    ),
  ],
);
