import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { platforms, SUBMISSION_TYPES, stages, TASK_KINDS, taskTemplates } from '../catalog/schema';
import { users } from '../identity/schema';
import { platformProfiles, students } from '../students/schema';

/**
 * tasks — tasks, due-date extensions, submissions (versions) and reviews (data-model.md
 * 2-5, state machine 3-1). "Overdue" is never stored: it is computed from `status` and
 * `due_at`. Submissions are never edited: a revision is a new version.
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export { SUBMISSION_TYPES, TASK_KINDS };

export const TASK_STATUSES = [
  'open',
  'in_progress',
  'submitted',
  'changes_requested',
  'accepted',
  'cancelled',
] as const;
export const TASK_PRIORITIES = ['normal', 'urgent'] as const;
export const REVIEW_OUTCOMES = ['accepted', 'changes_requested'] as const;

const ts = () => timestamp({ withTimezone: true });
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export type SubmissionLink = { url: string; label: string | null };

export const tasks = pgTable(
  'tasks',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    title: text().notNull(),
    /** Includes the acceptance criterion. Visible to the student. */
    description: text(),
    kind: text({ enum: TASK_KINDS }).notNull(),
    submissionType: text({ enum: SUBMISSION_TYPES }).notNull(),
    stageId: uuid().references(() => stages.id),
    requiredForGate: boolean().notNull().default(false),
    priority: text({ enum: TASK_PRIORITIES }).notNull().default('normal'),
    status: text({ enum: TASK_STATUSES }).notNull().default('open'),
    /** End of the chosen Tehran day (23:59:59 Asia/Tehran), as UTC. */
    dueAt: ts().notNull(),
    originalDueAt: ts().notNull(),
    reviewerId: uuid()
      .notNull()
      .references(() => users.id),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    templateId: uuid().references(() => taskTemplates.id),
    /** Tasks created by one bulk assignment (F4 Should). */
    batchId: uuid(),
    /** For `profile_review`: the showcase a submission snapshots. */
    profileId: uuid().references(() => platformProfiles.id, { onDelete: 'set null' }),
    /** Reviews with `changes_requested` (base of R-LOOP). */
    revisionCount: integer().notNull().default(0),
    /** Due-date extensions (base of R-EXTEND). */
    extensionCount: integer().notNull().default(0),
    statusChangedAt: ts().notNull(),
    /** Base of the review SLA. */
    lastSubmittedAt: ts(),
    /** `accepted` or `cancelled` time (base of R-NOTASK). */
    closedAt: ts(),
    cancelReason: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('tasks_student_status_idx').on(t.studentId, t.status),
    index('tasks_review_queue_idx')
      .on(t.reviewerId, t.lastSubmittedAt)
      .where(sql`${t.status} = 'submitted'`),
    index('tasks_due_open_idx')
      .on(t.dueAt)
      .where(sql`${t.status} IN ('open', 'in_progress', 'changes_requested')`),
    index('tasks_batch_idx').on(t.batchId),
    check('tasks_status_check', sql`${t.status} IN (${inList(TASK_STATUSES)})`),
    check('tasks_kind_check', sql`${t.kind} IN (${inList(TASK_KINDS)})`),
    check('tasks_submission_type_check', sql`${t.submissionType} IN (${inList(SUBMISSION_TYPES)})`),
    check('tasks_priority_check', sql`${t.priority} IN (${inList(TASK_PRIORITIES)})`),
    check('tasks_counts_check', sql`${t.revisionCount} >= 0 AND ${t.extensionCount} >= 0`),
    check(
      'tasks_cancel_reason_check',
      sql`${t.status} <> 'cancelled' OR (${t.cancelReason} IS NOT NULL AND btrim(${t.cancelReason}) <> '')`,
    ),
    check(
      'tasks_closed_at_check',
      sql`(${t.status} IN ('accepted', 'cancelled')) = (${t.closedAt} IS NOT NULL)`,
    ),
  ],
);

/** Each row: `tasks.extension_count += 1` and `tasks.due_at = new_due_at` in one transaction. */
export const taskExtensions = pgTable(
  'task_extensions',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id),
    previousDueAt: ts().notNull(),
    newDueAt: ts().notNull(),
    reason: text().notNull(),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('task_extensions_task_idx').on(t.taskId, t.createdAt),
    check('task_extensions_reason_check', sql`btrim(${t.reason}) <> ''`),
  ],
);

/** Submission versions 1, 2, … — never edited. */
export const submissions = pgTable(
  'submissions',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    taskId: uuid()
      .notNull()
      .references(() => tasks.id),
    version: integer().notNull(),
    bodyText: text(),
    /** `[{url, label}]`, https:// only (SEC-X2). */
    links: jsonb().$type<SubmissionLink[]>().notNull().default([]),
    /** Required for `proposal_review`. */
    platformId: uuid().references(() => platforms.id),
    /** Job post (English). Required for `proposal_review`. */
    jobPostText: text(),
    /** Proposal (English). Required for `proposal_review`. */
    proposalText: text(),
    /** For `profile_review`. */
    profileText: text(),
    /** Anonymous use to improve the tools (D6). Default OFF. */
    aiUseConsent: boolean().notNull().default(false),
    aiUseConsentAt: ts(),
    submittedBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('submissions_task_version_key').on(t.taskId, t.version),
    check('submissions_version_check', sql`${t.version} >= 1`),
    check(
      'submissions_consent_check',
      sql`NOT ${t.aiUseConsent} OR ${t.aiUseConsentAt} IS NOT NULL`,
    ),
  ],
);

/** At most one review per submission; the text is editable for 24 h, the outcome never. */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    submissionId: uuid()
      .notNull()
      .references(() => submissions.id),
    reviewerId: uuid()
      .notNull()
      .references(() => users.id),
    outcome: text({ enum: REVIEW_OUTCOMES }).notNull(),
    /** Persian, following mentor-workflow.md section 6. */
    feedbackText: text().notNull(),
    score: smallint(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reviews_submission_key').on(t.submissionId),
    index('reviews_reviewer_idx').on(t.reviewerId, t.createdAt),
    check('reviews_outcome_check', sql`${t.outcome} IN (${inList(REVIEW_OUTCOMES)})`),
    check('reviews_score_check', sql`${t.score} IS NULL OR ${t.score} BETWEEN 1 AND 5`),
  ],
);
