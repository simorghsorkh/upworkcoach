import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { inheritedOrganizationId, users } from '../identity/schema';
import { students } from '../students/schema';

/**
 * timeline — notes (manual interactions) and automatic events (data-model.md 2-6).
 *
 * Security invariant (ADR-0004 section 3): no student-side query reads `notes` without
 * `visibility = 'shared' AND deleted_at IS NULL`; that condition lives in exactly one repo
 * function (`listSharedNotesForStudent`). Notes are never copied into `timeline_events`,
 * so visibility has one source. Students never read `timeline_events` in 0.1.
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const NOTE_KINDS = ['note', 'session', 'call', 'external_message', 'weekly_review'] as const;
/**
 * `private` (sprint 4 of Coach Office): only the author reads it, the admin included
 * (founder decision Q8). The organization still sees that a note exists through its effects
 * (health «red without action»), never its text.
 */
export const NOTE_VISIBILITIES = ['internal', 'shared', 'private'] as const;

const ts = () => timestamp({ withTimezone: true });
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const notes = pgTable(
  'notes',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    /** admin or mentor only. */
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    kind: text({ enum: NOTE_KINDS }).notNull().default('note'),
    /** Default INTERNAL (PRD F5). */
    visibility: text({ enum: NOTE_VISIBILITIES }).notNull().default('internal'),
    body: text().notNull(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    /** Default now; editable to log yesterday's session. */
    occurredAt: ts().notNull(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
    deletedAt: ts(),
  },
  (t) => [
    index('notes_student_occurred_idx')
      .on(t.studentId, t.occurredAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),
    check('notes_kind_check', sql`${t.kind} IN (${inList(NOTE_KINDS)})`),
    check('notes_visibility_check', sql`${t.visibility} IN (${inList(NOTE_VISIBILITIES)})`),
    check('notes_body_check', sql`btrim(${t.body}) <> ''`),
  ],
);

export const timelineEvents = pgTable(
  'timeline_events',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    type: text().notNull(),
    /** null = the system. */
    actorId: uuid().references(() => users.id),
    subjectType: text(),
    subjectId: uuid(),
    /** Raw facts (ids, statuses). Never secrets or links (same rule as audit_log). */
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: ts().notNull(),
  },
  (t) => [index('timeline_events_student_occurred_idx').on(t.studentId, t.occurredAt.desc())],
);
