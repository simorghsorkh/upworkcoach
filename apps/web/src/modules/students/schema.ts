import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { platforms, stages, tracks } from '../catalog/schema';
import { inheritedOrganizationId, organizationId, users } from '../identity/schema';

/**
 * students — student record, mentor assignment history, platform profiles and their
 * snapshots (data-model.md 2-3; ADR-0004: `primary_mentor_id` is the source of truth of a
 * mentor's scope).
 *
 * Security rule (PRD section 6, tech-stack.md rule 8): no column for a platform password,
 * login e-mail or account cookie exists here, and none ever will.
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const LIFECYCLE_STATUSES = ['active', 'paused', 'graduated', 'dropped'] as const;
export const STUDENT_LEVELS = ['beginner', 'applying', 'active', 'advanced'] as const;
export const PRIOR_EXPERIENCES = ['none', 'applied_no_result', 'few_contracts', 'active'] as const;
export const ASSIGNMENT_ROLES = ['primary', 'secondary', 'backup'] as const;
export const PROFILE_KINDS = ['profile', 'gig', 'linkedin', 'portfolio_page', 'other'] as const;
export const PROFILE_STATUSES = ['building', 'active', 'restricted', 'suspended'] as const;
export const RATE_UNITS = ['hour', 'fixed', 'package', 'month'] as const;

const ts = () => timestamp({ withTimezone: true });

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const students = pgTable(
  'students',
  {
    organizationId: organizationId(),
    userId: uuid()
      .primaryKey()
      .references(() => users.id),
    /** Primary mentor (role mentor or admin). null = unassigned (only admins see it). */
    primaryMentorId: uuid().references(() => users.id),
    lifecycleStatus: text({ enum: LIFECYCLE_STATUSES }).notNull().default('active'),
    /** Only for `paused` (Tehran calendar day). */
    pausedUntil: date({ mode: 'string' }),
    statusReason: text(),
    currentStageId: uuid()
      .notNull()
      .references(() => stages.id),
    stageEnteredAt: ts().notNull(),
    trackId: uuid().references(() => tracks.id),
    primaryPlatformId: uuid().references(() => platforms.id),
    level: text({ enum: STUDENT_LEVELS }),
    cohort: text(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    messengerHandle: text(),
    primarySkill: text(),
    skillLevel: smallint(),
    englishWriting: smallint(),
    englishSpeaking: smallint(),
    hoursPerWeek: smallint(),
    incomeGoalUsd: integer(),
    goal90d: text('goal_90d'),
    priorExperience: text({ enum: PRIOR_EXPERIENCES }),
    selfReportedBlocker: text(),
    nicheStatement: text(),
    joinedAt: ts().notNull().defaultNow(),
    /** Last login, submission, question message, check-in or milestone proposal (R-INACT). */
    lastActivityAt: ts(),
    /** Normalised name, phone, messenger handle and tags (ADR-0008). */
    searchText: text().notNull().default(''),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('students_org_lifecycle_idx').on(t.organizationId, t.lifecycleStatus),
    index('students_mentor_lifecycle_idx').on(t.primaryMentorId, t.lifecycleStatus),
    index('students_current_stage_idx').on(t.currentStageId),
    index('students_tags_gin_idx').using('gin', t.tags),
    index('students_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    check('students_lifecycle_check', sql`${t.lifecycleStatus} IN (${inList(LIFECYCLE_STATUSES)})`),
    check(
      'students_paused_until_check',
      sql`(${t.lifecycleStatus} = 'paused') = (${t.pausedUntil} IS NOT NULL)`,
    ),
    check(
      'students_level_check',
      sql`${t.level} IS NULL OR ${t.level} IN (${inList(STUDENT_LEVELS)})`,
    ),
    check(
      'students_prior_experience_check',
      sql`${t.priorExperience} IS NULL OR ${t.priorExperience} IN (${inList(PRIOR_EXPERIENCES)})`,
    ),
    check(
      'students_scales_check',
      sql`(${t.skillLevel} IS NULL OR ${t.skillLevel} BETWEEN 1 AND 5)
        AND (${t.englishWriting} IS NULL OR ${t.englishWriting} BETWEEN 1 AND 5)
        AND (${t.englishSpeaking} IS NULL OR ${t.englishSpeaking} BETWEEN 1 AND 5)`,
    ),
    check(
      'students_numbers_check',
      sql`(${t.hoursPerWeek} IS NULL OR ${t.hoursPerWeek} BETWEEN 0 AND 168)
        AND (${t.incomeGoalUsd} IS NULL OR ${t.incomeGoalUsd} >= 0)`,
    ),
  ],
);

/**
 * Assignment history. Invariant: `students.primary_mentor_id` always equals the active
 * `primary` row; both change only in students.service (one transaction).
 */
export const mentorAssignments = pgTable(
  'mentor_assignments',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    mentorId: uuid()
      .notNull()
      .references(() => users.id),
    role: text({ enum: ASSIGNMENT_ROLES }).notNull().default('primary'),
    startedAt: ts().notNull().defaultNow(),
    endedAt: ts(),
    assignedBy: uuid().references(() => users.id),
    reason: text(),
  },
  (t) => [
    uniqueIndex('mentor_assignments_one_active_primary')
      .on(t.studentId)
      .where(sql`${t.role} = 'primary' AND ${t.endedAt} IS NULL`),
    index('mentor_assignments_student_idx').on(t.studentId, t.startedAt),
    check('mentor_assignments_role_check', sql`${t.role} IN (${inList(ASSIGNMENT_ROLES)})`),
  ],
);

/** Showcases: "which profiles does this student have?" (no password field, ever). */
export const platformProfiles = pgTable(
  'platform_profiles',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    studentId: uuid()
      .notNull()
      .references(() => students.userId),
    platformId: uuid()
      .notNull()
      .references(() => platforms.id),
    kind: text({ enum: PROFILE_KINDS }).notNull(),
    /** Stored only. The system never opens or fetches it (no scraping). https:// only. */
    publicUrl: text(),
    headline: text(),
    rateAmount: numeric({ precision: 12, scale: 2 }),
    rateCurrency: char({ length: 3 }),
    rateUnit: text({ enum: RATE_UNITS }),
    status: text({ enum: PROFILE_STATUSES }).notNull().default('building'),
    niche: text(),
    /** Visible to the student. Internal notes belong in `notes`. */
    notes: text(),
    isPrimary: boolean().notNull().default(false),
    mentorApprovedAt: ts(),
    mentorApprovedBy: uuid().references(() => users.id),
    createdBy: uuid().references(() => users.id),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
    deletedAt: ts(),
  },
  (t) => [
    index('platform_profiles_student_idx').on(t.studentId).where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex('platform_profiles_one_primary')
      .on(t.studentId)
      .where(sql`${t.isPrimary} AND ${t.deletedAt} IS NULL`),
    check('platform_profiles_kind_check', sql`${t.kind} IN (${inList(PROFILE_KINDS)})`),
    check('platform_profiles_status_check', sql`${t.status} IN (${inList(PROFILE_STATUSES)})`),
    check(
      'platform_profiles_rate_unit_check',
      sql`${t.rateUnit} IS NULL OR ${t.rateUnit} IN (${inList(RATE_UNITS)})`,
    ),
    check(
      'platform_profiles_rate_amount_check',
      sql`${t.rateAmount} IS NULL OR ${t.rateAmount} >= 0`,
    ),
    check(
      'platform_profiles_https_check',
      sql`${t.publicUrl} IS NULL OR ${t.publicUrl} LIKE 'https://%'`,
    ),
  ],
);

/** Full-text versions of a showcase (progress comparison). */
export const profileSnapshots = pgTable(
  'profile_snapshots',
  {
    organizationId: inheritedOrganizationId(),
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    profileId: uuid()
      .notNull()
      .references(() => platformProfiles.id, { onDelete: 'cascade' }),
    headline: text(),
    bodyText: text().notNull(),
    rateText: text(),
    /** FK to `submissions` is added with the tasks module (sprint 3). */
    sourceSubmissionId: uuid(),
    createdBy: uuid().references(() => users.id),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index('profile_snapshots_profile_idx').on(t.profileId, t.createdAt)],
);
