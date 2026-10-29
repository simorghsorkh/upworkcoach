import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import {
  type ContentLink,
  learningPaths,
  milestoneTypes,
  SUBMISSION_TYPES,
  stages,
} from '../catalog/schema';
import { inheritedOrganizationId, organizationId, users } from '../identity/schema';
import { TRANSITION_KINDS } from '../path/schema';
import { students } from '../students/schema';

/**
 * programs — templates, runs and enrollments (ADR-0012, sprint 3 of Coach Office).
 *
 *   program_templates ─< curriculum_nodes        what a program teaches (editable)
 *   program_runs      ─< run_nodes               a copy of the nodes made when the run starts,
 *                                                so editing the template never changes a run
 *   program_runs      ─< run_staff, enrollments ─< enrollment_transitions, enrollment_mentors
 *
 * The 0.1 path lives on as the "legacy" template and run (`legacy_path_id`): migration 0008
 * mirrors its stages into phases and every student's stage into an enrollment with database
 * triggers, so the kanban, health and «today» keep reading `students` until the contract
 * migration. Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const PROGRAM_KINDS = ['program', 'one_on_one'] as const;
export const TEMPLATE_STATUSES = ['draft', 'published', 'archived'] as const;
export const TEMPLATE_VISIBILITIES = ['private', 'pending_approval', 'organization'] as const;
export const NODE_TYPES = [
  'phase',
  'lesson',
  'assignment',
  'checklist',
  'resource',
  'milestone',
] as const;
export const RUN_MODES = ['group', 'individual'] as const;
export const RUN_STATUSES = ['draft', 'active', 'completed', 'archived'] as const;
export const STAFF_ROLES = ['manager', 'mentor'] as const;
export const ENROLLMENT_STATUSES = ['active', 'paused', 'completed', 'dropped'] as const;
export const ENROLLMENT_MENTOR_ROLES = ['primary', 'secondary'] as const;

export type ProgramKind = (typeof PROGRAM_KINDS)[number];
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
export type TemplateVisibility = (typeof TEMPLATE_VISIBILITIES)[number];
export type NodeType = (typeof NODE_TYPES)[number];
export type RunMode = (typeof RUN_MODES)[number];
export type RunStatus = (typeof RUN_STATUSES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
export type EnrollmentMentorRole = (typeof ENROLLMENT_MENTOR_ROLES)[number];

const ts = () => timestamp({ withTimezone: true });
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const programTemplates = pgTable(
  'program_templates',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    kind: text({ enum: PROGRAM_KINDS }).notNull(),
    title: text().notNull(),
    description: text(),
    /** Language the content is written in (ADR-0013); content is never machine-translated. */
    sourceLocale: text().notNull().default('fa'),
    status: text({ enum: TEMPLATE_STATUSES }).notNull().default('draft'),
    /** A mentor's template is private until an admin approves it for the organization. */
    visibility: text({ enum: TEMPLATE_VISIBILITIES }).notNull().default('private'),
    /** null for the legacy template that migration 0008 made from the 0.1 path. */
    ownerId: uuid().references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    approvedAt: ts(),
    /** Why an admin sent the template back to private. */
    rejectionReason: text(),
    // Package (a sellable plan, ADR-0012 section 4); all optional, no price column.
    sessionQuota: integer(),
    sessionMinutes: integer(),
    validityDays: integer(),
    durationWeeks: integer(),
    /** Add-ons such as `{ "freelancing": true }` (ADR-0012 section 8). */
    extensions: jsonb().$type<Record<string, boolean>>().notNull().default({}),
    /** +1 on every change after publishing; a run records the revision it copied. */
    revision: integer().notNull().default(1),
    legacyPathId: uuid().references(() => learningPaths.id),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('program_templates_org_status_idx').on(t.organizationId, t.status),
    uniqueIndex('program_templates_legacy_path_key')
      .on(t.legacyPathId)
      .where(sql`${t.legacyPathId} IS NOT NULL`),
    check('program_templates_kind_check', sql`${t.kind} IN (${inList(PROGRAM_KINDS)})`),
    check('program_templates_status_check', sql`${t.status} IN (${inList(TEMPLATE_STATUSES)})`),
    check(
      'program_templates_visibility_check',
      sql`${t.visibility} IN (${inList(TEMPLATE_VISIBILITIES)})`,
    ),
    check(
      'program_templates_numbers_check',
      sql`(${t.sessionQuota} IS NULL OR ${t.sessionQuota} BETWEEN 1 AND 1000)
        AND (${t.sessionMinutes} IS NULL OR ${t.sessionMinutes} BETWEEN 5 AND 600)
        AND (${t.validityDays} IS NULL OR ${t.validityDays} BETWEEN 1 AND 3650)
        AND (${t.durationWeeks} IS NULL OR ${t.durationWeeks} BETWEEN 1 AND 520)`,
    ),
  ],
);

/** Columns shared by template nodes and their per-run copies. */
const nodeColumns = () => ({
  id: uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  organizationId: inheritedOrganizationId(),
  nodeType: text({ enum: NODE_TYPES }).notNull(),
  title: text().notNull(),
  /** Lesson text, phase description for the mentee, assignment brief… */
  body: text(),
  /** Only https:// (SEC-X2), like `stages.content_links`. */
  contentLinks: jsonb().$type<ContentLink[]>().notNull().default([]),
  /** Order among siblings. Not unique: reordering is one transaction. */
  sortOrder: integer().notNull(),
  /** Counts toward progress (ADR-0012 section 6). */
  isRequired: boolean().notNull().default(true),
  /** Phase only: leaving it needs the mentor's sign-off. */
  isGate: boolean().notNull().default(false),
  /** Phase only: typical duration (like `stages.expected_days`). */
  expectedDays: integer(),
  /** Phase only: no expected duration (like `stages.is_open_ended`). */
  isOpenEnded: boolean().notNull().default(false),
  /** Assignment only: deadline in days from the start of the phase. */
  dueOffsetDays: integer(),
  /** Assignment only: same values as `tasks.submission_type`. */
  submissionType: text({ enum: SUBMISSION_TYPES }),
  /** Checklist only: the items to tick. */
  checklistItems: jsonb().$type<string[]>().notNull().default([]),
  /**
   * Milestone only (Coach Office sprint 5): done when the mentee has an approved milestone of
   * this type; without a type, staff mark it done.
   */
  milestoneTypeId: uuid().references(() => milestoneTypes.id),
  /** Legacy phases only: the 0.1 stage this phase mirrors. */
  legacyStageId: uuid().references(() => stages.id),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

const nodeChecks = (
  name: string,
  t: {
    nodeType: AnyPgColumn;
    expectedDays: AnyPgColumn;
    dueOffsetDays: AnyPgColumn;
    parentId: AnyPgColumn;
  },
) => [
  check(`${name}_node_type_check`, sql`${t.nodeType} IN (${inList(NODE_TYPES)})`),
  // A phase is a top-level node; every other node sits inside one phase.
  check(`${name}_parent_check`, sql`(${t.nodeType} = 'phase') = (${t.parentId} IS NULL)`),
  check(
    `${name}_numbers_check`,
    sql`(${t.expectedDays} IS NULL OR ${t.expectedDays} BETWEEN 1 AND 3650)
      AND (${t.dueOffsetDays} IS NULL OR ${t.dueOffsetDays} BETWEEN 0 AND 3650)`,
  ),
];

export const curriculumNodes = pgTable(
  'curriculum_nodes',
  {
    ...nodeColumns(),
    templateId: uuid()
      .notNull()
      .references(() => programTemplates.id, { onDelete: 'cascade' }),
    parentId: uuid().references((): AnyPgColumn => curriculumNodes.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('curriculum_nodes_template_idx').on(t.templateId, t.parentId, t.sortOrder),
    uniqueIndex('curriculum_nodes_legacy_stage_key')
      .on(t.templateId, t.legacyStageId)
      .where(sql`${t.legacyStageId} IS NOT NULL`),
    ...nodeChecks('curriculum_nodes', t),
  ],
);

export const programRuns = pgTable(
  'program_runs',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    /** null: a one-on-one without a template (ADR-0012 section 3). */
    templateId: uuid().references(() => programTemplates.id, { onDelete: 'set null' }),
    kind: text({ enum: PROGRAM_KINDS }).notNull(),
    /** `group` = a cohort; `individual` = one mentee. */
    mode: text({ enum: RUN_MODES }).notNull(),
    title: text().notNull(),
    status: text({ enum: RUN_STATUSES }).notNull().default('draft'),
    /** Calendar days in the organization's time zone. */
    startsOn: date({ mode: 'string' }),
    endsOn: date({ mode: 'string' }),
    sourceLocale: text().notNull().default('fa'),
    /** The template revision the nodes were copied from. */
    templateRevision: integer(),
    legacyPathId: uuid().references(() => learningPaths.id),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('program_runs_org_status_idx').on(t.organizationId, t.status),
    index('program_runs_template_idx').on(t.templateId),
    uniqueIndex('program_runs_legacy_path_key')
      .on(t.legacyPathId)
      .where(sql`${t.legacyPathId} IS NOT NULL`),
    check('program_runs_kind_check', sql`${t.kind} IN (${inList(PROGRAM_KINDS)})`),
    check('program_runs_mode_check', sql`${t.mode} IN (${inList(RUN_MODES)})`),
    check('program_runs_status_check', sql`${t.status} IN (${inList(RUN_STATUSES)})`),
    check(
      'program_runs_dates_check',
      sql`${t.endsOn} IS NULL OR ${t.startsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`,
    ),
  ],
);

/** Snapshot of the template's nodes taken when the run is created (ADR-0012 option b). */
export const runNodes = pgTable(
  'run_nodes',
  {
    ...nodeColumns(),
    runId: uuid()
      .notNull()
      .references(() => programRuns.id, { onDelete: 'cascade' }),
    parentId: uuid().references((): AnyPgColumn => runNodes.id, { onDelete: 'cascade' }),
    sourceNodeId: uuid().references(() => curriculumNodes.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('run_nodes_run_idx').on(t.runId, t.parentId, t.sortOrder),
    uniqueIndex('run_nodes_legacy_stage_key')
      .on(t.runId, t.legacyStageId)
      .where(sql`${t.legacyStageId} IS NOT NULL`),
    ...nodeChecks('run_nodes', t),
  ],
);

/** Mentors and program managers of a run; a row ends instead of being deleted. */
export const runStaff = pgTable(
  'run_staff',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: inheritedOrganizationId(),
    runId: uuid()
      .notNull()
      .references(() => programRuns.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    role: text({ enum: STAFF_ROLES }).notNull(),
    startedAt: ts().notNull().defaultNow(),
    endedAt: ts(),
    assignedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('run_staff_active_key').on(t.runId, t.userId).where(sql`${t.endedAt} IS NULL`),
    index('run_staff_user_active_idx').on(t.userId).where(sql`${t.endedAt} IS NULL`),
    check('run_staff_role_check', sql`${t.role} IN (${inList(STAFF_ROLES)})`),
  ],
);

/** A mentee in a run. The package quota and validity are copied from the template. */
export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: inheritedOrganizationId(),
    runId: uuid()
      .notNull()
      .references(() => programRuns.id, { onDelete: 'cascade' }),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    status: text({ enum: ENROLLMENT_STATUSES }).notNull().default('active'),
    pausedUntil: date({ mode: 'string' }),
    /** null only while the run has no phase (a one-on-one without a template). */
    currentPhaseNodeId: uuid().references(() => runNodes.id),
    phaseEnteredAt: ts(),
    sessionQuota: integer(),
    validUntil: date({ mode: 'string' }),
    enrolledBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    enrolledAt: ts().notNull().defaultNow(),
    completedAt: ts(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('enrollments_run_student_key').on(t.runId, t.studentId),
    index('enrollments_student_idx').on(t.studentId),
    check('enrollments_status_check', sql`${t.status} IN (${inList(ENROLLMENT_STATUSES)})`),
  ],
);

/** Phase history of an enrollment (the legacy run keeps using `stage_transitions`). */
export const enrollmentTransitions = pgTable(
  'enrollment_transitions',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: inheritedOrganizationId(),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    /** null only for `initial`. */
    fromNodeId: uuid().references(() => runNodes.id),
    toNodeId: uuid()
      .notNull()
      .references(() => runNodes.id),
    kind: text({ enum: TRANSITION_KINDS }).notNull(),
    note: text(),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('enrollment_transitions_enrollment_idx').on(t.enrollmentId, t.createdAt),
    check('enrollment_transitions_kind_check', sql`${t.kind} IN (${inList(TRANSITION_KINDS)})`),
    check(
      'enrollment_transitions_from_check',
      sql`(${t.kind} = 'initial') = (${t.fromNodeId} IS NULL)`,
    ),
  ],
);

/**
 * Mentors of one enrollment (sprint 4). Together with `run_staff` this is where a mentor's
 * access to a student comes from (`access/scope.ts`). A row ends instead of being deleted, so
 * the table is also the assignment history. On the legacy run the primary row mirrors
 * `students.primary_mentor_id` (trigger `students_sync_legacy_mentor`, migration 0009).
 */
export const enrollmentMentors = pgTable(
  'enrollment_mentors',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: inheritedOrganizationId(),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    role: text({ enum: ENROLLMENT_MENTOR_ROLES }).notNull(),
    startedAt: ts().notNull().defaultNow(),
    endedAt: ts(),
    assignedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    reason: text(),
  },
  (t) => [
    uniqueIndex('enrollment_mentors_one_active_primary')
      .on(t.enrollmentId)
      .where(sql`${t.role} = 'primary' AND ${t.endedAt} IS NULL`),
    uniqueIndex('enrollment_mentors_active_key')
      .on(t.enrollmentId, t.userId)
      .where(sql`${t.endedAt} IS NULL`),
    index('enrollment_mentors_user_active_idx').on(t.userId).where(sql`${t.endedAt} IS NULL`),
    index('enrollment_mentors_enrollment_idx').on(t.enrollmentId, t.startedAt),
    check('enrollment_mentors_role_check', sql`${t.role} IN (${inList(ENROLLMENT_MENTOR_ROLES)})`),
  ],
);

/**
 * Lessons, resources, checklists and type-less milestones marked done for one enrollment
 * (ADR-0012 section 6; Coach Office sprint 5). A checklist row keeps its ticks while it is
 * not complete (`completed_at` null). Assignments are done by their task, milestones with a
 * type by the student's milestone.
 */
export const nodeCompletions = pgTable(
  'node_completions',
  {
    organizationId: inheritedOrganizationId(),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    runNodeId: uuid()
      .notNull()
      .references(() => runNodes.id, { onDelete: 'cascade' }),
    /** Checklist only: one tick per item, by position. */
    checklistState: jsonb().$type<boolean[]>().notNull().default([]),
    completedAt: ts(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.enrollmentId, t.runNodeId] })],
);
