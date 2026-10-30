import { and, asc, desc, eq, exists, inArray, isNull, ne, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/server/db';
import { platforms, stages, tracks } from '../catalog/schema';
import { studentHealth } from '../health/schema';
import { memberAccountStatus } from '../identity/membership-sql';
import { users } from '../identity/schema';
import { enrollments } from '../programs/schema';
import type { HealthFilter, LifecycleStatus } from './contracts';
import { mentorAssignments, platformProfiles, profileSnapshots, students } from './schema';

/**
 * students — queries. Only used inside the module. Columns are selected explicitly
 * (SEC-A9; `users.password_hash` is never read here).
 * Assumption (sprint-2 notes): list and detail queries JOIN `users` (name, phone, status),
 * `stages`, `tracks` and `platforms` read-only for display; writes stay in the owner module.
 * Sprint 4: they also LEFT JOIN `student_health` (read-only) for the staff health summary,
 * the health filter and sort. Students' own `/me` DTOs never read those columns.
 */

const mentorUsers = alias(users, 'mentor_users');

const studentColumns = {
  id: students.userId,
  displayName: users.displayName,
  phone: users.phone,
  accountStatus: memberAccountStatus(users.id, students.organizationId),
  erasedAt: users.erasedAt,
  inviteAcceptedAt: users.inviteAcceptedAt,
  inviteAcceptedUserAgent: users.inviteAcceptedUserAgent,
  primaryMentorId: students.primaryMentorId,
  mentorDisplayName: mentorUsers.displayName,
  lifecycleStatus: students.lifecycleStatus,
  pausedUntil: students.pausedUntil,
  statusReason: students.statusReason,
  currentStageId: students.currentStageId,
  stageName: stages.name,
  stageDisplayCode: stages.displayCode,
  stageExpectedDays: stages.expectedDays,
  stageIsOpenEnded: stages.isOpenEnded,
  stageSortOrder: stages.sortOrder,
  stageIsActive: stages.isActive,
  stageEnteredAt: students.stageEnteredAt,
  trackId: students.trackId,
  trackCode: tracks.code,
  trackName: tracks.name,
  primaryPlatformId: students.primaryPlatformId,
  primaryPlatformName: platforms.name,
  level: students.level,
  cohort: students.cohort,
  tags: students.tags,
  messengerHandle: students.messengerHandle,
  primarySkill: students.primarySkill,
  skillLevel: students.skillLevel,
  englishWriting: students.englishWriting,
  englishSpeaking: students.englishSpeaking,
  hoursPerWeek: students.hoursPerWeek,
  incomeGoalUsd: students.incomeGoalUsd,
  goal90d: students.goal90d,
  priorExperience: students.priorExperience,
  selfReportedBlocker: students.selfReportedBlocker,
  nicheStatement: students.nicheStatement,
  joinedAt: students.joinedAt,
  lastActivityAt: students.lastActivityAt,
  createdAt: students.createdAt,
  updatedAt: students.updatedAt,
  ...healthColumns(),
};

/** Staff-only health columns (null when not computed yet). */
function healthColumns() {
  return {
    healthStatus: studentHealth.status,
    healthReasons: studentHealth.reasons,
    healthChurnRisk: studentHealth.churnRisk,
    healthSnoozedUntil: studentHealth.snoozedUntil,
    healthStatusSince: studentHealth.statusSince,
    healthComputedAt: studentHealth.computedAt,
  };
}

function baseStudentQuery(db: DbOrTx) {
  return db
    .select(studentColumns)
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .innerJoin(stages, eq(stages.id, students.currentStageId))
    .leftJoin(mentorUsers, eq(mentorUsers.id, students.primaryMentorId))
    .leftJoin(tracks, eq(tracks.id, students.trackId))
    .leftJoin(platforms, eq(platforms.id, students.primaryPlatformId))
    .leftJoin(studentHealth, eq(studentHealth.studentId, students.userId));
}

export type StudentRow = NonNullable<Awaited<ReturnType<typeof findStudent>>>;

export async function findStudent(db: DbOrTx, id: string) {
  const [row] = await baseStudentQuery(db).where(eq(students.userId, id));
  return row ?? null;
}

export type ListFilter = {
  scope: SQL;
  lifecycle: LifecycleStatus[];
  stageId?: string;
  /** Holds a seat in this run (sprint 5c), optionally in this phase. */
  runId?: string;
  phaseId?: string;
  mentorId?: string | 'none';
  tag?: string;
  platformId?: string;
  cohort?: string;
  searchPattern?: string;
  /** Health statuses (needs the `student_health` join). */
  health?: HealthFilter[];
  /** Hide students whose health is snoozed past this instant ("Snoozed until …"). */
  hideSnoozedAt?: Date;
};

/** Conditions on `student_health` (only valid in queries that LEFT JOIN it). */
export function healthConditions(filter: Pick<ListFilter, 'health' | 'hideSnoozedAt'>): SQL[] {
  const conditions: SQL[] = [];
  if (filter.health && filter.health.length > 0) {
    conditions.push(inArray(studentHealth.status, [...filter.health]));
  }
  if (filter.hideSnoozedAt) {
    const at = filter.hideSnoozedAt;
    const visible = or(
      isNull(studentHealth.snoozedUntil),
      sql`${studentHealth.snoozedUntil} <= ${at}`,
    );
    if (visible) conditions.push(visible);
  }
  return conditions;
}

export function listConditions(filter: ListFilter): SQL[] {
  const conditions: SQL[] = [filter.scope, inArray(students.lifecycleStatus, filter.lifecycle)];
  if (filter.stageId) conditions.push(eq(students.currentStageId, filter.stageId));
  if (filter.runId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${enrollments} WHERE ${enrollments.studentId} = ${students.userId}
        AND ${enrollments.runId} = ${filter.runId}
        AND ${enrollments.status} IN ('active', 'paused')
        ${filter.phaseId ? sql`AND ${enrollments.currentPhaseNodeId} = ${filter.phaseId}` : sql``})`,
    );
  }
  if (filter.mentorId === 'none') conditions.push(isNull(students.primaryMentorId));
  else if (filter.mentorId) conditions.push(eq(students.primaryMentorId, filter.mentorId));
  if (filter.tag) conditions.push(sql`${students.tags} @> ARRAY[${filter.tag}]::text[]`);
  if (filter.cohort) conditions.push(eq(students.cohort, filter.cohort));
  if (filter.searchPattern) {
    conditions.push(sql`${students.searchText} ILIKE ${filter.searchPattern}`);
  }
  return conditions;
}

/** `platformId`: primary platform OR a not-deleted profile on it. */
function platformCondition(db: DbOrTx, platformId: string | undefined): SQL | undefined {
  if (!platformId) return undefined;
  return or(
    eq(students.primaryPlatformId, platformId),
    exists(
      db
        .select({ one: sql`1` })
        .from(platformProfiles)
        .where(
          and(
            eq(platformProfiles.studentId, students.userId),
            eq(platformProfiles.platformId, platformId),
            isNull(platformProfiles.deletedAt),
          ),
        ),
    ),
  );
}

/** red → yellow → green → paused → untracked → not computed; then the oldest status first. */
const healthRank = sql`CASE ${studentHealth.status} WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 WHEN 'green' THEN 2 WHEN 'paused' THEN 3 WHEN 'untracked' THEN 4 ELSE 5 END`;

export async function listStudents(
  db: DbOrTx,
  filter: ListFilter,
  sort: 'name' | 'lastActivity' | 'stageDays' | 'joined' | 'health',
  limit: number,
  offset: number,
) {
  const conditions = [...listConditions(filter), ...healthConditions(filter)];
  if (filter.platformId) {
    const platformId = filter.platformId;
    const condition = or(
      eq(students.primaryPlatformId, platformId),
      exists(
        db
          .select({ one: sql`1` })
          .from(platformProfiles)
          .where(
            and(
              eq(platformProfiles.studentId, students.userId),
              eq(platformProfiles.platformId, platformId),
              isNull(platformProfiles.deletedAt),
            ),
          ),
      ),
    );
    if (condition) conditions.push(condition);
  }
  const order =
    sort === 'lastActivity'
      ? [sql`${students.lastActivityAt} DESC NULLS LAST`, asc(users.displayName)]
      : sort === 'stageDays'
        ? [asc(students.stageEnteredAt), asc(users.displayName)]
        : sort === 'joined'
          ? [desc(students.joinedAt)]
          : sort === 'health'
            ? [
                asc(healthRank),
                sql`${studentHealth.statusSince} ASC NULLS LAST`,
                asc(users.displayName),
              ]
            : [asc(users.displayName)];
  return baseStudentQuery(db)
    .where(and(...conditions))
    .orderBy(...order, asc(students.userId))
    .limit(limit)
    .offset(offset);
}

/**
 * Counter rows for the filter chips: one row per (lifecycle, health) with its count, under
 * the scope and every filter except lifecycle and health (the caller sums them).
 */
export async function countStudentsByStatus(
  db: DbOrTx,
  filter: Omit<ListFilter, 'lifecycle' | 'health' | 'hideSnoozedAt'>,
) {
  const conditions = listConditions({
    ...filter,
    lifecycle: ['active', 'paused', 'graduated', 'dropped'],
  });
  const platform = platformCondition(db, filter.platformId);
  if (platform) conditions.push(platform);
  return db
    .select({
      lifecycleStatus: students.lifecycleStatus,
      healthStatus: studentHealth.status,
      count: sql<number>`count(*)::int`,
    })
    .from(students)
    .leftJoin(studentHealth, eq(studentHealth.studentId, students.userId))
    .where(and(...conditions))
    .groupBy(students.lifecycleStatus, studentHealth.status);
}

/** Tags in the scope (GET /students/tags), most used first. */
export async function listTags(db: DbOrTx, scope: SQL, lifecycle: LifecycleStatus[]) {
  const tag = sql<string>`unnest(${students.tags})`;
  const rows = await db
    .select({ tag, count: sql<number>`count(*)::int` })
    .from(students)
    .where(and(scope, inArray(students.lifecycleStatus, lifecycle)))
    .groupBy(sql`1`)
    .orderBy(sql`2 DESC`, sql`1 ASC`);
  return rows;
}

/** Students for the kanban (no pagination; ≤ 500 by design, overview.md 6). */
export async function listForBoard(db: DbOrTx, conditions: SQL[]) {
  return db
    .select({
      id: students.userId,
      displayName: users.displayName,
      accountStatus: memberAccountStatus(users.id, students.organizationId),
      currentStageId: students.currentStageId,
      stageEnteredAt: students.stageEnteredAt,
      lifecycleStatus: students.lifecycleStatus,
      primaryMentorId: students.primaryMentorId,
      ...healthColumns(),
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(studentHealth, eq(studentHealth.studentId, students.userId))
    .where(and(...conditions))
    .orderBy(asc(students.stageEnteredAt), asc(users.displayName));
}

/** The organization's student with this (normalised) phone («go to the existing record»). */
export async function findStudentIdByPhone(
  db: DbOrTx,
  org: string,
  phone: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: students.userId })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(eq(students.organizationId, org), eq(users.phone, phone), isNull(users.erasedAt)));
  return row?.id ?? null;
}

export type StudentWriteValues = Partial<{
  primaryMentorId: string | null;
  lifecycleStatus: LifecycleStatus;
  pausedUntil: string | null;
  statusReason: string | null;
  currentStageId: string;
  stageEnteredAt: Date;
  trackId: string | null;
  primaryPlatformId: string | null;
  level: 'beginner' | 'applying' | 'active' | 'advanced' | null;
  cohort: string | null;
  tags: string[];
  messengerHandle: string | null;
  primarySkill: string | null;
  skillLevel: number | null;
  englishWriting: number | null;
  englishSpeaking: number | null;
  hoursPerWeek: number | null;
  incomeGoalUsd: number | null;
  goal90d: string | null;
  priorExperience: 'none' | 'applied_no_result' | 'few_contracts' | 'active' | null;
  selfReportedBlocker: string | null;
  nicheStatement: string | null;
  joinedAt: Date;
  searchText: string;
}>;

export async function insertStudent(
  db: DbOrTx,
  values: StudentWriteValues & {
    organizationId: string;
    userId: string;
    currentStageId: string;
    stageEnteredAt: Date;
    searchText: string;
  },
  now: Date,
): Promise<void> {
  await db.insert(students).values({
    ...values,
    joinedAt: values.joinedAt ?? now,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateStudent(
  db: DbOrTx,
  id: string,
  values: StudentWriteValues,
  now: Date,
): Promise<void> {
  await db
    .update(students)
    .set({ ...values, updatedAt: now })
    .where(eq(students.userId, id));
}

/** Row lock for read-check-write sequences (ifUpdatedAt, mentor change, stage change). */
export async function lockStudent(db: DbOrTx, id: string) {
  const [row] = await db
    .select({
      id: students.userId,
      updatedAt: students.updatedAt,
      primaryMentorId: students.primaryMentorId,
      currentStageId: students.currentStageId,
      lifecycleStatus: students.lifecycleStatus,
      messengerHandle: students.messengerHandle,
      tags: students.tags,
      displayName: users.displayName,
      phone: users.phone,
      erasedAt: users.erasedAt,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.userId, id))
    .for('update', { of: students });
  return row ?? null;
}

export async function countActiveStudentsInStage(db: DbOrTx, stageId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(students)
    .where(and(eq(students.currentStageId, stageId), eq(students.lifecycleStatus, 'active')));
  return row?.count ?? 0;
}

// ---- mentor assignments ---------------------------------------------------------------

export async function endActivePrimaryAssignment(
  db: DbOrTx,
  studentId: string,
  now: Date,
): Promise<void> {
  await db
    .update(mentorAssignments)
    .set({ endedAt: now })
    .where(
      and(
        eq(mentorAssignments.studentId, studentId),
        eq(mentorAssignments.role, 'primary'),
        isNull(mentorAssignments.endedAt),
      ),
    );
}

export async function insertPrimaryAssignment(
  db: DbOrTx,
  values: { studentId: string; mentorId: string; assignedBy: string; reason: string | null },
  now: Date,
): Promise<void> {
  await db.insert(mentorAssignments).values({ ...values, role: 'primary', startedAt: now });
}

// ---- profiles --------------------------------------------------------------------------

const profileColumns = {
  id: platformProfiles.id,
  studentId: platformProfiles.studentId,
  platformId: platformProfiles.platformId,
  platformName: platforms.name,
  kind: platformProfiles.kind,
  publicUrl: platformProfiles.publicUrl,
  headline: platformProfiles.headline,
  rateAmount: platformProfiles.rateAmount,
  rateCurrency: platformProfiles.rateCurrency,
  rateUnit: platformProfiles.rateUnit,
  status: platformProfiles.status,
  niche: platformProfiles.niche,
  notes: platformProfiles.notes,
  isPrimary: platformProfiles.isPrimary,
  mentorApprovedAt: platformProfiles.mentorApprovedAt,
  createdAt: platformProfiles.createdAt,
  updatedAt: platformProfiles.updatedAt,
};

export type ProfileRow = Awaited<ReturnType<typeof listProfiles>>[number];

export async function listProfiles(db: DbOrTx, studentIds: readonly string[]) {
  if (studentIds.length === 0) return [];
  return db
    .select(profileColumns)
    .from(platformProfiles)
    .innerJoin(platforms, eq(platforms.id, platformProfiles.platformId))
    .where(
      and(inArray(platformProfiles.studentId, [...studentIds]), isNull(platformProfiles.deletedAt)),
    )
    .orderBy(
      desc(platformProfiles.isPrimary),
      asc(platforms.sortOrder),
      asc(platformProfiles.createdAt),
    );
}

/** Not-deleted profile by id (soft-deleted profiles do not exist for anyone). */
export async function findProfile(db: DbOrTx, id: string) {
  const [row] = await db
    .select(profileColumns)
    .from(platformProfiles)
    .innerJoin(platforms, eq(platforms.id, platformProfiles.platformId))
    .where(and(eq(platformProfiles.id, id), isNull(platformProfiles.deletedAt)));
  return row ?? null;
}

export async function lockProfile(db: DbOrTx, id: string) {
  const [row] = await db
    .select({
      id: platformProfiles.id,
      studentId: platformProfiles.studentId,
      updatedAt: platformProfiles.updatedAt,
      rateAmount: platformProfiles.rateAmount,
      rateCurrency: platformProfiles.rateCurrency,
    })
    .from(platformProfiles)
    .where(and(eq(platformProfiles.id, id), isNull(platformProfiles.deletedAt)))
    .for('update');
  return row ?? null;
}

export type ProfileWriteValues = Partial<{
  platformId: string;
  kind: 'profile' | 'gig' | 'linkedin' | 'portfolio_page' | 'other';
  publicUrl: string | null;
  headline: string | null;
  rateAmount: string | null;
  rateCurrency: string | null;
  rateUnit: 'hour' | 'fixed' | 'package' | 'month' | null;
  status: 'building' | 'active' | 'restricted' | 'suspended';
  niche: string | null;
  notes: string | null;
  isPrimary: boolean;
  mentorApprovedAt: Date | null;
  mentorApprovedBy: string | null;
  deletedAt: Date;
}>;

/** Only one primary showcase per student (partial unique index). */
export async function clearPrimaryProfiles(
  db: DbOrTx,
  studentId: string,
  exceptId: string | null,
  now: Date,
): Promise<void> {
  const conditions: SQL[] = [
    eq(platformProfiles.studentId, studentId),
    eq(platformProfiles.isPrimary, true),
    isNull(platformProfiles.deletedAt),
  ];
  if (exceptId) conditions.push(ne(platformProfiles.id, exceptId));
  await db
    .update(platformProfiles)
    .set({ isPrimary: false, updatedAt: now })
    .where(and(...conditions));
}

export async function insertProfile(
  db: DbOrTx,
  values: ProfileWriteValues & {
    studentId: string;
    platformId: string;
    kind: NonNullable<ProfileWriteValues['kind']>;
    createdBy: string;
  },
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(platformProfiles)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning({ id: platformProfiles.id });
  if (!row) throw new Error('insertProfile returned no row');
  return row.id;
}

export async function updateProfile(
  db: DbOrTx,
  id: string,
  values: ProfileWriteValues,
  now: Date,
): Promise<void> {
  await db
    .update(platformProfiles)
    .set({ ...values, updatedAt: now })
    .where(eq(platformProfiles.id, id));
}

export async function listSnapshots(db: DbOrTx, profileId: string) {
  return db
    .select({
      id: profileSnapshots.id,
      headline: profileSnapshots.headline,
      bodyText: profileSnapshots.bodyText,
      rateText: profileSnapshots.rateText,
      createdAt: profileSnapshots.createdAt,
    })
    .from(profileSnapshots)
    .where(eq(profileSnapshots.profileId, profileId))
    .orderBy(desc(profileSnapshots.createdAt));
}

export async function insertSnapshot(
  db: DbOrTx,
  values: {
    profileId: string;
    headline: string | null;
    bodyText: string;
    rateText: string | null;
    createdBy: string;
    /** Set when the snapshot comes from a task submission (profile_review). */
    sourceSubmissionId?: string | null;
  },
  now: Date,
) {
  const [row] = await db
    .insert(profileSnapshots)
    .values({ ...values, createdAt: now })
    .returning({
      id: profileSnapshots.id,
      headline: profileSnapshots.headline,
      bodyText: profileSnapshots.bodyText,
      rateText: profileSnapshots.rateText,
      createdAt: profileSnapshots.createdAt,
    });
  if (!row) throw new Error('insertSnapshot returned no row');
  return row;
}
