import { and, asc, desc, eq, inArray, isNull, max, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/server/db';
import { platforms, stages } from '../catalog/schema';
import { isActiveStaffOf } from '../identity/membership-sql';
import { users } from '../identity/schema';
import { enrollments, programRuns } from '../programs/schema';
import { platformProfiles, students } from '../students/schema';
import type { TaskStatus } from './contracts';
import { reviews, type SubmissionLink, submissions, taskExtensions, tasks } from './schema';

/**
 * tasks — queries (only used inside the module). Columns are explicit (SEC-A9).
 * Display JOINs to users, stages, platform_profiles and platforms are read-only.
 */

const studentUsers = alias(users, 'student_users');
const reviewerUsers = alias(users, 'reviewer_users');
const creatorUsers = alias(users, 'creator_users');
const profilePlatforms = alias(platforms, 'profile_platforms');

const taskColumns = {
  id: tasks.id,
  studentId: tasks.studentId,
  studentDisplayName: studentUsers.displayName,
  title: tasks.title,
  description: tasks.description,
  kind: tasks.kind,
  submissionType: tasks.submissionType,
  stageId: tasks.stageId,
  stageName: stages.name,
  stageDisplayCode: stages.displayCode,
  requiredForGate: tasks.requiredForGate,
  priority: tasks.priority,
  status: tasks.status,
  dueAt: tasks.dueAt,
  originalDueAt: tasks.originalDueAt,
  reviewerId: tasks.reviewerId,
  reviewerDisplayName: reviewerUsers.displayName,
  createdById: tasks.createdBy,
  createdByDisplayName: creatorUsers.displayName,
  templateId: tasks.templateId,
  batchId: tasks.batchId,
  profileId: tasks.profileId,
  profileDeletedAt: platformProfiles.deletedAt,
  profileUrl: platformProfiles.publicUrl,
  profilePlatformName: profilePlatforms.name,
  revisionCount: tasks.revisionCount,
  extensionCount: tasks.extensionCount,
  statusChangedAt: tasks.statusChangedAt,
  lastSubmittedAt: tasks.lastSubmittedAt,
  closedAt: tasks.closedAt,
  cancelReason: tasks.cancelReason,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
};

function baseTaskQuery(db: DbOrTx) {
  return db
    .select(taskColumns)
    .from(tasks)
    .innerJoin(studentUsers, eq(studentUsers.id, tasks.studentId))
    .innerJoin(reviewerUsers, eq(reviewerUsers.id, tasks.reviewerId))
    .innerJoin(creatorUsers, eq(creatorUsers.id, tasks.createdBy))
    .leftJoin(stages, eq(stages.id, tasks.stageId))
    .leftJoin(platformProfiles, eq(platformProfiles.id, tasks.profileId))
    .leftJoin(profilePlatforms, eq(profilePlatforms.id, platformProfiles.platformId));
}

export type TaskRow = NonNullable<Awaited<ReturnType<typeof findTask>>>;

export async function findTask(db: DbOrTx, id: string) {
  const [row] = await baseTaskQuery(db).where(eq(tasks.id, id));
  return row ?? null;
}

export async function lockTask(db: DbOrTx, id: string) {
  const [row] = await db
    .select({
      id: tasks.id,
      studentId: tasks.studentId,
      status: tasks.status,
      submissionType: tasks.submissionType,
      dueAt: tasks.dueAt,
      profileId: tasks.profileId,
      title: tasks.title,
      reviewerId: tasks.reviewerId,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(eq(tasks.id, id))
    .for('update');
  return row ?? null;
}

export async function listTasksOfStudent(
  db: DbOrTx,
  studentId: string,
  filter: { statuses?: TaskStatus[]; stageId?: string },
) {
  const conditions: SQL[] = [eq(tasks.studentId, studentId)];
  if (filter.statuses) conditions.push(inArray(tasks.status, filter.statuses));
  if (filter.stageId) conditions.push(eq(tasks.stageId, filter.stageId));
  return baseTaskQuery(db)
    .where(and(...conditions))
    .orderBy(asc(tasks.dueAt), asc(tasks.id));
}

/** "Overdue" in SQL — same rule as `policy.isOverdue` (student-actionable, past due). */
export function overdueCondition(now: Date): SQL {
  return sql`(${tasks.status} in ('open', 'in_progress', 'changes_requested') and ${tasks.dueAt} < ${now.toISOString()}::timestamptz)`;
}

/**
 * GET /tasks (staff, across students). `conditions` already hold the scope (SEC-A2) on
 * `students.primary_mentor_id`; offset pagination like the other staff lists.
 */
export async function listStaffTasks(
  db: DbOrTx,
  conditions: SQL[],
  sort: 'due' | 'recent',
  limit: number,
  offset: number,
) {
  return baseTaskQuery(db)
    .innerJoin(students, eq(students.userId, tasks.studentId))
    .where(and(...conditions))
    .orderBy(
      ...(sort === 'recent'
        ? [desc(tasks.updatedAt), desc(tasks.id)]
        : [asc(tasks.dueAt), asc(tasks.id)]),
    )
    .limit(limit)
    .offset(offset);
}

/** Per-status numbers (and overdue) of the same staff list, for the tab badges. */
export async function countStaffTasks(db: DbOrTx, conditions: SQL[], now: Date) {
  return db
    .select({
      status: tasks.status,
      count: sql<number>`count(*)::int`,
      overdue: sql<number>`(count(*) filter (where ${overdueCondition(now)}))::int`,
    })
    .from(tasks)
    .innerJoin(students, eq(students.userId, tasks.studentId))
    .where(and(...conditions))
    .groupBy(tasks.status);
}

export type TaskWriteValues = {
  studentId: string;
  title: string;
  description: string | null;
  kind: 'path_assignment' | 'custom' | 'follow_up' | 'session_prep';
  submissionType: 'text' | 'link' | 'file' | 'checkbox' | 'proposal_review' | 'profile_review';
  stageId: string | null;
  requiredForGate: boolean;
  priority: 'normal' | 'urgent';
  dueAt: Date;
  reviewerId: string;
  createdBy: string;
  templateId: string | null;
  batchId: string | null;
  profileId: string | null;
  /** Coach Office sprint 5: a task from a program activity. */
  enrollmentId?: string | null;
  nodeId?: string | null;
  /** Coach Office sprint 5b: a "next action" of a mentoring session. */
  sessionId?: string | null;
};

export async function insertTask(db: DbOrTx, values: TaskWriteValues, now: Date): Promise<string> {
  const [row] = await db
    .insert(tasks)
    .values({
      ...values,
      originalDueAt: values.dueAt,
      status: 'open',
      statusChangedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: tasks.id });
  if (!row) throw new Error('insertTask returned no row');
  return row.id;
}

export async function updateTask(
  db: DbOrTx,
  id: string,
  values: Partial<{
    title: string;
    description: string | null;
    priority: 'normal' | 'urgent';
    reviewerId: string;
    stageId: string | null;
    requiredForGate: boolean;
    status: TaskStatus;
    statusChangedAt: Date;
    dueAt: Date;
    lastSubmittedAt: Date;
    closedAt: Date | null;
    cancelReason: string;
    revisionCount: SQL;
    extensionCount: SQL;
  }>,
  now: Date,
): Promise<void> {
  await db
    .update(tasks)
    .set({ ...values, updatedAt: now })
    .where(eq(tasks.id, id));
}

export const increment = (column: typeof tasks.revisionCount | typeof tasks.extensionCount) =>
  sql`${column} + 1`;

// ---- submissions -----------------------------------------------------------------------

export async function nextVersion(db: DbOrTx, taskId: string): Promise<number> {
  const [row] = await db
    .select({ v: max(submissions.version) })
    .from(submissions)
    .where(eq(submissions.taskId, taskId));
  return (row?.v ?? 0) + 1;
}

export async function insertSubmission(
  db: DbOrTx,
  values: {
    taskId: string;
    version: number;
    bodyText: string | null;
    links: SubmissionLink[];
    platformId: string | null;
    jobPostText: string | null;
    proposalText: string | null;
    profileText: string | null;
    aiUseConsent: boolean;
    aiUseConsentAt: Date | null;
    submittedBy: string;
  },
  now: Date,
) {
  const [row] = await db
    .insert(submissions)
    .values({ ...values, createdAt: now })
    .returning({
      id: submissions.id,
      version: submissions.version,
      createdAt: submissions.createdAt,
    });
  if (!row) throw new Error('insertSubmission returned no row');
  return row;
}

const submitterUsers = alias(users, 'submitter_users');

export async function listSubmissions(db: DbOrTx, taskIds: readonly string[]) {
  if (taskIds.length === 0) return [];
  return db
    .select({
      id: submissions.id,
      taskId: submissions.taskId,
      version: submissions.version,
      bodyText: submissions.bodyText,
      links: submissions.links,
      platformId: submissions.platformId,
      platformName: platforms.name,
      jobPostText: submissions.jobPostText,
      proposalText: submissions.proposalText,
      profileText: submissions.profileText,
      aiUseConsent: submissions.aiUseConsent,
      submittedBy: submissions.submittedBy,
      submittedByDisplayName: submitterUsers.displayName,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .innerJoin(submitterUsers, eq(submitterUsers.id, submissions.submittedBy))
    .leftJoin(platforms, eq(platforms.id, submissions.platformId))
    .where(inArray(submissions.taskId, [...taskIds]))
    .orderBy(desc(submissions.version));
}

export async function findSubmission(db: DbOrTx, id: string) {
  const [row] = await db
    .select({ id: submissions.id, taskId: submissions.taskId, version: submissions.version })
    .from(submissions)
    .where(eq(submissions.id, id));
  return row ?? null;
}

export async function latestSubmission(db: DbOrTx, taskId: string) {
  const [row] = await db
    .select({ id: submissions.id, version: submissions.version })
    .from(submissions)
    .where(eq(submissions.taskId, taskId))
    .orderBy(desc(submissions.version))
    .limit(1);
  return row ?? null;
}

// ---- reviews ---------------------------------------------------------------------------

const reviewUsers = alias(users, 'review_users');

export async function listReviews(db: DbOrTx, submissionIds: readonly string[]) {
  if (submissionIds.length === 0) return [];
  return db
    .select({
      id: reviews.id,
      submissionId: reviews.submissionId,
      reviewerId: reviews.reviewerId,
      reviewerDisplayName: reviewUsers.displayName,
      outcome: reviews.outcome,
      feedbackText: reviews.feedbackText,
      score: reviews.score,
      createdAt: reviews.createdAt,
      updatedAt: reviews.updatedAt,
    })
    .from(reviews)
    .innerJoin(reviewUsers, eq(reviewUsers.id, reviews.reviewerId))
    .where(inArray(reviews.submissionId, [...submissionIds]));
}

export async function insertReview(
  db: DbOrTx,
  values: {
    submissionId: string;
    reviewerId: string;
    outcome: 'accepted' | 'changes_requested';
    feedbackText: string;
    score: number | null;
  },
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(reviews)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning({ id: reviews.id });
  if (!row) throw new Error('insertReview returned no row');
  return row.id;
}

export async function lockReview(db: DbOrTx, id: string) {
  const [row] = await db
    .select({
      id: reviews.id,
      submissionId: reviews.submissionId,
      reviewerId: reviews.reviewerId,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(eq(reviews.id, id))
    .for('update');
  return row ?? null;
}

export async function updateReview(
  db: DbOrTx,
  id: string,
  values: Partial<{ feedbackText: string; score: number | null }>,
  now: Date,
): Promise<void> {
  await db
    .update(reviews)
    .set({ ...values, updatedAt: now })
    .where(eq(reviews.id, id));
}

// ---- extensions ------------------------------------------------------------------------

const extensionUsers = alias(users, 'extension_users');

export async function insertExtension(
  db: DbOrTx,
  values: { taskId: string; previousDueAt: Date; newDueAt: Date; reason: string; actorId: string },
  now: Date,
): Promise<void> {
  await db.insert(taskExtensions).values({ ...values, createdAt: now });
}

export async function listExtensions(db: DbOrTx, taskId: string) {
  return db
    .select({
      id: taskExtensions.id,
      previousDueAt: taskExtensions.previousDueAt,
      newDueAt: taskExtensions.newDueAt,
      reason: taskExtensions.reason,
      actorId: taskExtensions.actorId,
      actorDisplayName: extensionUsers.displayName,
      createdAt: taskExtensions.createdAt,
    })
    .from(taskExtensions)
    .innerJoin(extensionUsers, eq(extensionUsers.id, taskExtensions.actorId))
    .where(eq(taskExtensions.taskId, taskId))
    .orderBy(desc(taskExtensions.createdAt));
}

// ---- review queue (staff list; scope in SQL, SEC-A2) ----------------------------------

export type ReviewQueueFilters = { reviewerId?: string; runId?: string; studentId?: string };

export async function listReviewQueue(db: DbOrTx, scope: SQL, filters: ReviewQueueFilters = {}) {
  const conditions: SQL[] = [eq(tasks.status, 'submitted'), scope];
  if (filters.reviewerId) conditions.push(eq(tasks.reviewerId, filters.reviewerId));
  if (filters.studentId) conditions.push(eq(tasks.studentId, filters.studentId));
  if (filters.runId) conditions.push(eq(enrollments.runId, filters.runId));
  return db
    .select({
      taskId: tasks.id,
      title: tasks.title,
      studentId: tasks.studentId,
      studentDisplayName: studentUsers.displayName,
      stageId: tasks.stageId,
      stageName: stages.name,
      stageDisplayCode: stages.displayCode,
      reviewerId: tasks.reviewerId,
      reviewerDisplayName: reviewerUsers.displayName,
      requiredForGate: tasks.requiredForGate,
      priority: tasks.priority,
      submissionType: tasks.submissionType,
      dueAt: tasks.dueAt,
      lastSubmittedAt: tasks.lastSubmittedAt,
      submissionId: submissions.id,
      version: submissions.version,
      runId: programRuns.id,
      runTitle: programRuns.title,
      legacyPathId: programRuns.legacyPathId,
    })
    .from(tasks)
    .innerJoin(students, eq(students.userId, tasks.studentId))
    .innerJoin(studentUsers, eq(studentUsers.id, tasks.studentId))
    .innerJoin(reviewerUsers, eq(reviewerUsers.id, tasks.reviewerId))
    .leftJoin(stages, eq(stages.id, tasks.stageId))
    .leftJoin(enrollments, eq(enrollments.id, tasks.enrollmentId))
    .leftJoin(programRuns, eq(programRuns.id, enrollments.runId))
    .innerJoin(
      submissions,
      and(
        eq(submissions.taskId, tasks.id),
        sql`${submissions.version} = (SELECT max(s2.version) FROM submissions s2 WHERE s2.task_id = ${tasks.id})`,
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(tasks.lastSubmittedAt), asc(tasks.id));
}

/** Primary mentor of a student (default reviewer) — read-only. */
export async function primaryMentorOf(db: DbOrTx, studentId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: students.primaryMentorId })
    .from(students)
    .where(eq(students.userId, studentId));
  return row?.id ?? null;
}

/** Active (non-erased) staff of the organization among `ids`. */
export async function activeStaffIds(
  db: DbOrTx,
  organizationId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.id, [...ids]),
        eq(users.status, 'active'),
        isNull(users.erasedAt),
        isActiveStaffOf(users.id, organizationId),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** CSV export (admin): every task, by student then deadline. */
export async function listAllTasks(db: DbOrTx, organizationId: string) {
  return baseTaskQuery(db)
    .where(eq(tasks.organizationId, organizationId))
    .orderBy(asc(studentUsers.displayName), asc(tasks.dueAt), asc(tasks.id));
}
