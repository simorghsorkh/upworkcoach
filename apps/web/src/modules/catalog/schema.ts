import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
import { inheritedOrganizationId, organizationId, users } from '../identity/schema';

/**
 * catalog — settings, tracks, platforms, learning paths and stages (data-model.md 2-2).
 * Settings values are validated with the zod schema of each key (`catalog/contracts.ts`);
 * a missing settings row means "use the default".
 *
 * Configuration instead of code (data-model.md 0, tech-stack.md 3 rule 7): stage and
 * platform names never appear in code. Special behaviour only comes from flags
 * (`stages.is_open_ended`). Rows are deactivated, never deleted.
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

const ts = () => timestamp({ withTimezone: true });

/** One row per organization and key (ADR-0011): each organization has its own settings. */
export const settings = pgTable(
  'settings',
  {
    organizationId: organizationId(),
    key: text().notNull(),
    value: jsonb().notNull(),
    version: integer().notNull().default(1),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'settings_pkey', columns: [t.organizationId, t.key] })],
);

/** Path branch by client-acquisition model (learning-path.md section 2): B, C, D. */
export const tracks = pgTable(
  'tracks',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    /** Label only (`B`, `C`, `D`); no logic depends on it. */
    code: text().notNull(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tracks_org_code_key').on(t.organizationId, t.code)],
);

export const platforms = pgTable(
  'platforms',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    name: text().notNull(),
    trackId: uuid().references(() => tracks.id, { onDelete: 'set null' }),
    sortOrder: integer().notNull().default(0),
    /** Inactive: not offered in new forms; existing data keeps it. */
    isActive: boolean().notNull().default(true),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('platforms_org_name_key').on(t.organizationId, sql`lower(${t.name})`)],
);

/** One default path per organization; ADR-0012 turns paths into program templates. */
export const learningPaths = pgTable(
  'learning_paths',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    name: text().notNull(),
    isDefault: boolean().notNull().default(false),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('learning_paths_one_default').on(t.organizationId).where(sql`${t.isDefault}`),
  ],
);

export type ContentLink = { title: string; url: string };

export const stages = pgTable(
  'stages',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: inheritedOrganizationId(),
    pathId: uuid()
      .notNull()
      .references(() => learningPaths.id),
    /** Display label such as «۵» (the Persian digit 5). Code never depends on it. */
    displayCode: text().notNull(),
    name: text().notNull(),
    /** Order in the path and of the kanban columns. Not unique: reordering is one transaction. */
    sortOrder: integer().notNull(),
    /** Typical duration (base of R-STALL and kanban warnings). null = no R-STALL. */
    expectedDays: integer(),
    /** Open-ended stage (e.g. growth): no R-STALL / R-NOTASK, no "over expected" warning. */
    isOpenEnded: boolean().notNull().default(false),
    /** What the student sees in "my path". */
    studentDescription: text(),
    /** Links to external learning content (assumption A5). Only https:// (SEC-X2). */
    contentLinks: jsonb().$type<ContentLink[]>().notNull().default([]),
    isActive: boolean().notNull().default(true),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('stages_path_order_idx').on(t.pathId, t.sortOrder),
    check('stages_expected_days_positive', sql`${t.expectedDays} IS NULL OR ${t.expectedDays} > 0`),
  ],
);

/** `tasks.kind` values (data-model.md 2-5); shared by templates and tasks. */
export const TASK_KINDS = ['path_assignment', 'custom', 'follow_up', 'session_prep'] as const;
/** `tasks.submission_type` values (data-model.md 2-5). */
export const SUBMISSION_TYPES = [
  'text',
  'link',
  'file',
  'checkbox',
  'proposal_review',
  'profile_review',
] as const;

const enumList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * Task templates (data-model.md 2-2, Should): recurring tasks defined once and assigned to
 * several students. `suggest_on_stage_entry` only SUGGESTS them on a stage change (F3);
 * no task is created automatically.
 */
export const taskTemplates = pgTable(
  'task_templates',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    /** null = general template (any stage). */
    stageId: uuid().references(() => stages.id),
    title: text().notNull(),
    description: text(),
    kind: text({ enum: TASK_KINDS }).notNull().default('path_assignment'),
    submissionType: text({ enum: SUBMISSION_TYPES }).notNull().default('text'),
    /** Default deadline in days from creation (null → settings.tasks.defaultDueDays). */
    defaultDueDays: integer(),
    requiredForGate: boolean().notNull().default(false),
    suggestOnStageEntry: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('task_templates_stage_idx').on(t.stageId, t.sortOrder),
    check('task_templates_kind_check', sql`${t.kind} IN (${enumList(TASK_KINDS)})`),
    check(
      'task_templates_submission_type_check',
      sql`${t.submissionType} IN (${enumList(SUBMISSION_TYPES)})`,
    ),
    check(
      'task_templates_due_days_check',
      sql`${t.defaultDueDays} IS NULL OR ${t.defaultDueDays} BETWEEN 1 AND 365`,
    ),
  ],
);

/**
 * Milestone types (data-model.md 2-2, F9). The North Star dashboard reads the
 * `counts_for_north_star` flag, never the name (tech-stack.md rule 7).
 */
export const milestoneTypes = pgTable(
  'milestone_types',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    name: text().notNull(),
    countsForNorthStar: boolean().notNull().default(false),
    /** "First …" types: at most one APPROVED milestone of this type per student. */
    uniquePerStudent: boolean().notNull().default(false),
    /** A student proposal needs evidence (text or an image). */
    requiresEvidence: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index('milestone_types_order_idx').on(t.organizationId, t.sortOrder)],
);

export const CANNED_RESPONSE_CATEGORIES = ['red_line', 'general'] as const;

/** Standard answers (F8, F11): e.g. the «red lines» answer about buying accounts. */
export const cannedResponses = pgTable(
  'canned_responses',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    title: text().notNull(),
    body: text().notNull(),
    category: text({ enum: CANNED_RESPONSE_CATEGORIES }).notNull().default('general'),
    isActive: boolean().notNull().default(true),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    check(
      'canned_responses_category_check',
      sql`${t.category} IN (${enumList(CANNED_RESPONSE_CATEGORIES)})`,
    ),
  ],
);
