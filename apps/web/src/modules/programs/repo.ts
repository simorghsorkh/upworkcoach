import { and, asc, count, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/server/db';
import { stages } from '../catalog/schema';
import { organizationMemberships, organizations, users } from '../identity/schema';
import { goals, mentoringSessions } from '../mentoring/schema';
import { milestones } from '../milestones/schema';
import type { TransitionKind } from '../path/schema';
import { students } from '../students/schema';
import { tasks } from '../tasks/schema';
import {
  curriculumNodes,
  type EnrollmentMentorRole,
  type EnrollmentStatus,
  enrollmentMentors,
  enrollments,
  enrollmentTransitions,
  nodeCompletions,
  programRuns,
  programTemplates,
  runNodes,
  runStaff,
  type StaffRole,
} from './schema';

/** programs — queries. Only programs/service.ts imports this file. */

// ---- organization ----------------------------------------------------------------------

/** Time zone (for "today") and default language (for new content) of the organization. */
export async function organizationDefaults(db: DbOrTx, org: string) {
  const [row] = await db
    .select({ timeZone: organizations.timezone, locale: organizations.defaultLocale })
    .from(organizations)
    .where(eq(organizations.id, org));
  return row ?? { timeZone: 'Asia/Tehran', locale: 'fa' };
}

/** Active staff-capable member of the organization (owner, admin or mentor). */
export async function isStaffMember(db: DbOrTx, org: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, org),
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.status, 'active'),
        inArray(organizationMemberships.role, ['owner', 'admin', 'mentor']),
      ),
    );
  return Boolean(row);
}

// ---- templates -------------------------------------------------------------------------

const templateColumns = {
  id: programTemplates.id,
  kind: programTemplates.kind,
  title: programTemplates.title,
  description: programTemplates.description,
  sourceLocale: programTemplates.sourceLocale,
  status: programTemplates.status,
  visibility: programTemplates.visibility,
  ownerId: programTemplates.ownerId,
  ownerName: users.displayName,
  rejectionReason: programTemplates.rejectionReason,
  sessionQuota: programTemplates.sessionQuota,
  sessionMinutes: programTemplates.sessionMinutes,
  validityDays: programTemplates.validityDays,
  durationWeeks: programTemplates.durationWeeks,
  extensions: programTemplates.extensions,
  revision: programTemplates.revision,
  legacyPathId: programTemplates.legacyPathId,
  updatedAt: programTemplates.updatedAt,
  phaseCount: sql<number>`(SELECT count(*)::int FROM ${curriculumNodes} c WHERE c.template_id = ${programTemplates.id} AND c.parent_id IS NULL)`,
  activityCount: sql<number>`(SELECT count(*)::int FROM ${curriculumNodes} c WHERE c.template_id = ${programTemplates.id} AND c.parent_id IS NOT NULL)`,
  runCount: sql<number>`(SELECT count(*)::int FROM ${programRuns} r WHERE r.template_id = ${programTemplates.id})`,
};

export type TemplateRow = Awaited<ReturnType<typeof findTemplate>> & object;

export async function findTemplate(db: DbOrTx, org: string, id: string) {
  const [row] = await db
    .select(templateColumns)
    .from(programTemplates)
    .leftJoin(users, eq(users.id, programTemplates.ownerId))
    .where(and(eq(programTemplates.organizationId, org), eq(programTemplates.id, id)));
  return row ?? null;
}

/** Locks the template row (node edits and status changes are serialised per template). */
export async function lockTemplate(db: DbOrTx, org: string, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: programTemplates.id })
    .from(programTemplates)
    .where(and(eq(programTemplates.organizationId, org), eq(programTemplates.id, id)))
    .for('update');
  return rows.length > 0;
}

export async function listTemplates(
  db: DbOrTx,
  org: string,
  filter: { visibleToMentor?: string; status?: string },
) {
  const conditions: SQL[] = [eq(programTemplates.organizationId, org)];
  if (filter.status) conditions.push(sql`${programTemplates.status} = ${filter.status}`);
  if (filter.visibleToMentor) {
    conditions.push(
      sql`((${programTemplates.visibility} = 'organization' AND ${programTemplates.status} <> 'draft') OR ${programTemplates.ownerId} = ${filter.visibleToMentor})`,
    );
  }
  return db
    .select(templateColumns)
    .from(programTemplates)
    .leftJoin(users, eq(users.id, programTemplates.ownerId))
    .where(and(...conditions))
    .orderBy(desc(programTemplates.updatedAt), desc(programTemplates.id));
}

export async function insertTemplate(db: DbOrTx, values: typeof programTemplates.$inferInsert) {
  const [row] = await db
    .insert(programTemplates)
    .values(values)
    .returning({ id: programTemplates.id });
  if (!row) throw new Error('insertTemplate returned no row');
  return row.id;
}

export async function updateTemplate(
  db: DbOrTx,
  id: string,
  values: Partial<typeof programTemplates.$inferInsert>,
  now: Date,
): Promise<void> {
  await db
    .update(programTemplates)
    .set({ ...values, updatedAt: now })
    .where(eq(programTemplates.id, id));
}

/** After a change to a published template: the next run copies the new revision. */
export async function touchTemplate(db: DbOrTx, id: string, now: Date): Promise<void> {
  await db
    .update(programTemplates)
    .set({
      updatedAt: now,
      revision: sql`${programTemplates.revision} + CASE WHEN ${programTemplates.status} = 'draft' THEN 0 ELSE 1 END`,
    })
    .where(eq(programTemplates.id, id));
}

export async function deleteTemplate(db: DbOrTx, id: string): Promise<void> {
  await db.delete(programTemplates).where(eq(programTemplates.id, id));
}

// ---- nodes -----------------------------------------------------------------------------

const nodeColumns = (t: typeof curriculumNodes | typeof runNodes) => ({
  id: t.id,
  parentId: t.parentId,
  nodeType: t.nodeType,
  title: t.title,
  body: t.body,
  contentLinks: t.contentLinks,
  sortOrder: t.sortOrder,
  isRequired: t.isRequired,
  isGate: t.isGate,
  expectedDays: t.expectedDays,
  isOpenEnded: t.isOpenEnded,
  dueOffsetDays: t.dueOffsetDays,
  submissionType: t.submissionType,
  checklistItems: t.checklistItems,
  milestoneTypeId: t.milestoneTypeId,
  legacyStageId: t.legacyStageId,
});

export type NodeRow = Awaited<ReturnType<typeof listTemplateNodes>>[number];

export async function listTemplateNodes(db: DbOrTx, templateId: string) {
  return db
    .select(nodeColumns(curriculumNodes))
    .from(curriculumNodes)
    .where(eq(curriculumNodes.templateId, templateId))
    .orderBy(
      asc(curriculumNodes.sortOrder),
      asc(curriculumNodes.createdAt),
      asc(curriculumNodes.id),
    );
}

export async function findTemplateNode(db: DbOrTx, templateId: string, nodeId: string) {
  const [row] = await db
    .select(nodeColumns(curriculumNodes))
    .from(curriculumNodes)
    .where(and(eq(curriculumNodes.templateId, templateId), eq(curriculumNodes.id, nodeId)));
  return row ?? null;
}

export async function siblingIds(db: DbOrTx, templateId: string, parentId: string | null) {
  const rows = await db
    .select({ id: curriculumNodes.id })
    .from(curriculumNodes)
    .where(
      and(
        eq(curriculumNodes.templateId, templateId),
        parentId ? eq(curriculumNodes.parentId, parentId) : isNull(curriculumNodes.parentId),
      ),
    );
  return rows.map((r) => r.id);
}

export async function maxSortOrder(
  db: DbOrTx,
  templateId: string,
  parentId: string | null,
): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${curriculumNodes.sortOrder}), 0)::int` })
    .from(curriculumNodes)
    .where(
      and(
        eq(curriculumNodes.templateId, templateId),
        parentId ? eq(curriculumNodes.parentId, parentId) : isNull(curriculumNodes.parentId),
      ),
    );
  return row?.max ?? 0;
}

export async function insertTemplateNodes(
  db: DbOrTx,
  values: Array<typeof curriculumNodes.$inferInsert>,
): Promise<void> {
  if (values.length) await db.insert(curriculumNodes).values(values);
}

export async function updateTemplateNode(
  db: DbOrTx,
  nodeId: string,
  values: Partial<typeof curriculumNodes.$inferInsert>,
  now: Date,
): Promise<void> {
  await db
    .update(curriculumNodes)
    .set({ ...values, updatedAt: now })
    .where(eq(curriculumNodes.id, nodeId));
}

export async function deleteTemplateNode(db: DbOrTx, nodeId: string): Promise<void> {
  await db.delete(curriculumNodes).where(eq(curriculumNodes.id, nodeId));
}

export async function setNodeOrder(db: DbOrTx, ids: string[], now: Date): Promise<void> {
  for (const [i, id] of ids.entries()) {
    await db
      .update(curriculumNodes)
      .set({ sortOrder: (i + 1) * 10, updatedAt: now })
      .where(eq(curriculumNodes.id, id));
  }
}

// ---- runs ------------------------------------------------------------------------------

const runColumns = {
  id: programRuns.id,
  templateId: programRuns.templateId,
  templateTitle: programTemplates.title,
  kind: programRuns.kind,
  mode: programRuns.mode,
  title: programRuns.title,
  status: programRuns.status,
  startsOn: programRuns.startsOn,
  endsOn: programRuns.endsOn,
  templateRevision: programRuns.templateRevision,
  legacyPathId: programRuns.legacyPathId,
  createdAt: programRuns.createdAt,
};

export type RunRow = NonNullable<Awaited<ReturnType<typeof findRun>>>;

export async function findRun(db: DbOrTx, org: string, id: string) {
  const [row] = await db
    .select(runColumns)
    .from(programRuns)
    .leftJoin(programTemplates, eq(programTemplates.id, programRuns.templateId))
    .where(and(eq(programRuns.organizationId, org), eq(programRuns.id, id)));
  return row ?? null;
}

export async function lockRun(db: DbOrTx, id: string): Promise<void> {
  await db
    .select({ id: programRuns.id })
    .from(programRuns)
    .where(eq(programRuns.id, id))
    .for('update');
}

/**
 * Runs of the organization; for a mentor (`mentorScope`) only runs they staff or that hold
 * one of their mentees (`menteeCondition` is the student scope over `students`).
 */
export async function listRuns(
  db: DbOrTx,
  org: string,
  filter: { status?: string; mentorId?: string; menteeCondition?: SQL },
) {
  const conditions: SQL[] = [eq(programRuns.organizationId, org)];
  if (filter.status) conditions.push(sql`${programRuns.status} = ${filter.status}`);
  if (filter.mentorId && filter.menteeCondition) {
    conditions.push(sql`(
      EXISTS (SELECT 1 FROM ${runStaff} rs WHERE rs.run_id = ${programRuns.id} AND rs.user_id = ${filter.mentorId} AND rs.ended_at IS NULL)
      OR EXISTS (SELECT 1 FROM ${enrollments} e JOIN ${students} ON ${students.userId} = e.student_id
        WHERE e.run_id = ${programRuns.id} AND ${filter.menteeCondition})
    )`);
  }
  return db
    .select(runColumns)
    .from(programRuns)
    .leftJoin(programTemplates, eq(programTemplates.id, programRuns.templateId))
    .where(and(...conditions))
    .orderBy(
      sql`CASE ${programRuns.status} WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END`,
      desc(programRuns.createdAt),
    );
}

export async function insertRun(db: DbOrTx, values: typeof programRuns.$inferInsert) {
  const [row] = await db.insert(programRuns).values(values).returning({ id: programRuns.id });
  if (!row) throw new Error('insertRun returned no row');
  return row.id;
}

export async function updateRun(
  db: DbOrTx,
  id: string,
  values: Partial<typeof programRuns.$inferInsert>,
  now: Date,
): Promise<void> {
  await db
    .update(programRuns)
    .set({ ...values, updatedAt: now })
    .where(eq(programRuns.id, id));
}

/** Run nodes with, for legacy phases, whether their 0.1 stage is still active. */
export async function listRunNodes(db: DbOrTx, runId: string) {
  return db
    .select({ ...nodeColumns(runNodes), stageActive: stages.isActive })
    .from(runNodes)
    .leftJoin(stages, eq(stages.id, runNodes.legacyStageId))
    .where(eq(runNodes.runId, runId))
    .orderBy(asc(runNodes.sortOrder), asc(runNodes.createdAt), asc(runNodes.id));
}

export async function insertRunNodes(db: DbOrTx, values: Array<typeof runNodes.$inferInsert>) {
  if (values.length) await db.insert(runNodes).values(values);
}

export async function listStaff(db: DbOrTx, runIds: string[]) {
  if (!runIds.length) return [];
  return db
    .select({
      runId: runStaff.runId,
      userId: runStaff.userId,
      role: runStaff.role,
      displayName: users.displayName,
    })
    .from(runStaff)
    .innerJoin(users, eq(users.id, runStaff.userId))
    .where(and(inArray(runStaff.runId, runIds), isNull(runStaff.endedAt)))
    .orderBy(asc(runStaff.startedAt));
}

export async function insertStaff(
  db: DbOrTx,
  values: { runId: string; userId: string; role: StaffRole; assignedBy: string },
  now: Date,
): Promise<void> {
  await db.insert(runStaff).values({ ...values, startedAt: now });
}

export async function endStaff(db: DbOrTx, runId: string, userId: string, now: Date) {
  const rows = await db
    .update(runStaff)
    .set({ endedAt: now })
    .where(and(eq(runStaff.runId, runId), eq(runStaff.userId, userId), isNull(runStaff.endedAt)))
    .returning({ id: runStaff.id });
  return rows.length > 0;
}

// ---- enrollments -----------------------------------------------------------------------

const enrollmentColumns = {
  id: enrollments.id,
  runId: enrollments.runId,
  studentId: enrollments.studentId,
  studentName: users.displayName,
  primaryMentorId: students.primaryMentorId,
  status: enrollments.status,
  pausedUntil: enrollments.pausedUntil,
  currentPhaseNodeId: enrollments.currentPhaseNodeId,
  phaseEnteredAt: enrollments.phaseEnteredAt,
  sessionQuota: enrollments.sessionQuota,
  validUntil: enrollments.validUntil,
  enrolledAt: enrollments.enrolledAt,
};

export type EnrollmentRow = Awaited<ReturnType<typeof listEnrollments>>[number];

/** Enrollments of some runs; `condition` narrows them to the viewer's mentees. */
export async function listEnrollments(db: DbOrTx, runIds: string[], condition?: SQL) {
  if (!runIds.length) return [];
  return db
    .select(enrollmentColumns)
    .from(enrollments)
    .innerJoin(students, eq(students.userId, enrollments.studentId))
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(and(inArray(enrollments.runId, runIds), condition))
    .orderBy(asc(users.displayName), asc(enrollments.id));
}

export async function findEnrollment(db: DbOrTx, org: string, id: string, lock = false) {
  const query = db
    .select({ ...enrollmentColumns, organizationId: enrollments.organizationId })
    .from(enrollments)
    .innerJoin(students, eq(students.userId, enrollments.studentId))
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(and(eq(enrollments.organizationId, org), eq(enrollments.id, id)));
  const [row] = lock ? await query.for('update', { of: enrollments }) : await query;
  return row ?? null;
}

export async function enrolledStudentIds(db: DbOrTx, runId: string): Promise<Set<string>> {
  const rows = await db
    .select({ studentId: enrollments.studentId })
    .from(enrollments)
    .where(eq(enrollments.runId, runId));
  return new Set(rows.map((r) => r.studentId));
}

export async function countSeats(db: DbOrTx, runId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(enrollments)
    .where(and(eq(enrollments.runId, runId), inArray(enrollments.status, ['active', 'paused'])));
  return row?.n ?? 0;
}

export async function insertEnrollment(db: DbOrTx, values: typeof enrollments.$inferInsert) {
  const [row] = await db.insert(enrollments).values(values).returning({ id: enrollments.id });
  if (!row) throw new Error('insertEnrollment returned no row');
  return row.id;
}

export async function updateEnrollment(
  db: DbOrTx,
  id: string,
  values: {
    status?: EnrollmentStatus;
    pausedUntil?: string | null;
    completedAt?: Date | null;
    currentPhaseNodeId?: string;
    phaseEnteredAt?: Date;
  },
  now: Date,
): Promise<void> {
  await db
    .update(enrollments)
    .set({ ...values, updatedAt: now })
    .where(eq(enrollments.id, id));
}

export async function insertEnrollmentTransition(
  db: DbOrTx,
  values: {
    enrollmentId: string;
    fromNodeId: string | null;
    toNodeId: string;
    kind: TransitionKind;
    note: string | null;
    actorId: string;
  },
  now: Date,
): Promise<void> {
  await db.insert(enrollmentTransitions).values({ ...values, createdAt: now });
}

/** Students of the organization among `ids` that satisfy `condition` (the actor's scope). */
export async function studentsInScope(db: DbOrTx, ids: string[], condition: SQL) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: students.userId })
    .from(students)
    .where(and(inArray(students.userId, ids), condition));
  return rows.map((r) => r.id);
}

/** A student's enrollments with their run; `runStatuses` filters (mentee view). */
export async function listStudentEnrollments(
  db: DbOrTx,
  org: string,
  studentId: string,
  runStatuses?: string[],
) {
  return db
    .select({
      id: enrollments.id,
      status: enrollments.status,
      currentPhaseNodeId: enrollments.currentPhaseNodeId,
      enrolledAt: enrollments.enrolledAt,
      runId: programRuns.id,
      runTitle: programRuns.title,
      runKind: programRuns.kind,
      runMode: programRuns.mode,
      runStatus: programRuns.status,
      legacyPathId: programRuns.legacyPathId,
      sessionQuota: enrollments.sessionQuota,
      validUntil: enrollments.validUntil,
    })
    .from(enrollments)
    .innerJoin(programRuns, eq(programRuns.id, enrollments.runId))
    .where(
      and(
        eq(enrollments.organizationId, org),
        eq(enrollments.studentId, studentId),
        runStatuses ? inArray(programRuns.status, runStatuses as never[]) : undefined,
      ),
    )
    .orderBy(desc(enrollments.enrolledAt));
}

/** Phases of some runs (for positions), ordered. */
export async function listPhases(db: DbOrTx, runIds: string[]) {
  if (!runIds.length) return [];
  return db
    .select({ id: runNodes.id, runId: runNodes.runId, title: runNodes.title })
    .from(runNodes)
    .where(and(inArray(runNodes.runId, runIds), isNull(runNodes.parentId)))
    .orderBy(asc(runNodes.sortOrder), asc(runNodes.createdAt), asc(runNodes.id));
}

// ---- enrollment mentors (sprint 4) -----------------------------------------------------

const assigners = alias(users, 'em_assigners');

/** Mentor rows of enrollments, active first, then newest; `active` = not ended. */
export async function listEnrollmentMentors(db: DbOrTx, enrollmentIds: string[]) {
  if (!enrollmentIds.length) return [];
  return db
    .select({
      id: enrollmentMentors.id,
      enrollmentId: enrollmentMentors.enrollmentId,
      userId: enrollmentMentors.userId,
      displayName: users.displayName,
      role: enrollmentMentors.role,
      startedAt: enrollmentMentors.startedAt,
      endedAt: enrollmentMentors.endedAt,
      assignedById: enrollmentMentors.assignedBy,
      assignedByName: assigners.displayName,
      reason: enrollmentMentors.reason,
    })
    .from(enrollmentMentors)
    .innerJoin(users, eq(users.id, enrollmentMentors.userId))
    .leftJoin(assigners, eq(assigners.id, enrollmentMentors.assignedBy))
    .where(inArray(enrollmentMentors.enrollmentId, enrollmentIds))
    .orderBy(
      sql`${enrollmentMentors.endedAt} IS NOT NULL`,
      sql`${enrollmentMentors.role} = 'secondary'`,
      desc(enrollmentMentors.startedAt),
    );
}

export type EnrollmentMentorRow = Awaited<ReturnType<typeof listEnrollmentMentors>>[number];

export async function insertEnrollmentMentor(
  db: DbOrTx,
  values: {
    enrollmentId: string;
    userId: string;
    role: EnrollmentMentorRole;
    assignedBy: string;
    reason: string | null;
  },
  now: Date,
): Promise<void> {
  await db.insert(enrollmentMentors).values({ ...values, startedAt: now });
}

/** Ends the active rows of an enrollment that match; returns the ended rows. */
export async function endEnrollmentMentors(
  db: DbOrTx,
  enrollmentId: string,
  match: { userId?: string; role?: EnrollmentMentorRole },
  now: Date,
) {
  const conditions: SQL[] = [
    eq(enrollmentMentors.enrollmentId, enrollmentId),
    isNull(enrollmentMentors.endedAt),
  ];
  if (match.userId) conditions.push(eq(enrollmentMentors.userId, match.userId));
  if (match.role) conditions.push(eq(enrollmentMentors.role, match.role));
  return db
    .update(enrollmentMentors)
    .set({ endedAt: now })
    .where(and(...conditions))
    .returning({ userId: enrollmentMentors.userId, role: enrollmentMentors.role });
}

/** Active primary rows of a mentor in an organization (for "transfer all"). */
export async function activePrimaryEnrollmentsOf(db: DbOrTx, org: string, userId: string) {
  return db
    .select({
      enrollmentId: enrollmentMentors.enrollmentId,
      studentId: enrollments.studentId,
      legacyPathId: programRuns.legacyPathId,
    })
    .from(enrollmentMentors)
    .innerJoin(enrollments, eq(enrollments.id, enrollmentMentors.enrollmentId))
    .innerJoin(programRuns, eq(programRuns.id, enrollments.runId))
    .where(
      and(
        eq(enrollmentMentors.organizationId, org),
        eq(enrollmentMentors.userId, userId),
        eq(enrollmentMentors.role, 'primary'),
        isNull(enrollmentMentors.endedAt),
      ),
    )
    .orderBy(asc(enrollmentMentors.startedAt));
}

// ---- assignments and progress (Coach Office sprint 5) ----------------------------------

/** Every activity (not phases) of the runs, for progress. */
export async function listActivities(db: DbOrTx, runIds: string[]) {
  if (!runIds.length) return [];
  return db
    .select({
      id: runNodes.id,
      runId: runNodes.runId,
      parentId: runNodes.parentId,
      nodeType: runNodes.nodeType,
      isRequired: runNodes.isRequired,
      checklistItems: runNodes.checklistItems,
      milestoneTypeId: runNodes.milestoneTypeId,
    })
    .from(runNodes)
    .where(and(inArray(runNodes.runId, runIds), sql`${runNodes.nodeType} <> 'phase'`));
}

/** Live (not cancelled) program tasks of the enrollments — read-only over `tasks`. */
export async function listProgramTasks(db: DbOrTx, enrollmentIds: string[]) {
  if (!enrollmentIds.length) return [];
  const rows = await db
    .select({
      id: tasks.id,
      enrollmentId: tasks.enrollmentId,
      nodeId: tasks.nodeId,
      status: tasks.status,
      dueAt: tasks.dueAt,
    })
    .from(tasks)
    .where(
      and(
        inArray(tasks.enrollmentId, enrollmentIds),
        sql`${tasks.nodeId} IS NOT NULL`,
        sql`${tasks.status} <> 'cancelled'`,
      ),
    );
  return rows.map((r) => ({
    ...r,
    enrollmentId: r.enrollmentId as string,
    nodeId: r.nodeId as string,
  }));
}

export async function listCompletions(db: DbOrTx, enrollmentIds: string[]) {
  if (!enrollmentIds.length) return [];
  return db
    .select({
      enrollmentId: nodeCompletions.enrollmentId,
      runNodeId: nodeCompletions.runNodeId,
      checklistState: nodeCompletions.checklistState,
      completedAt: nodeCompletions.completedAt,
    })
    .from(nodeCompletions)
    .where(inArray(nodeCompletions.enrollmentId, enrollmentIds));
}

/** Milestone types each student has an approved milestone of — read-only over `milestones`. */
export async function approvedMilestoneTypes(db: DbOrTx, studentIds: string[]) {
  if (!studentIds.length) return [];
  return db
    .selectDistinct({ studentId: milestones.studentId, typeId: milestones.typeId })
    .from(milestones)
    .where(and(inArray(milestones.studentId, studentIds), eq(milestones.status, 'approved')));
}

export async function upsertCompletion(
  db: DbOrTx,
  values: {
    enrollmentId: string;
    runNodeId: string;
    checklistState: boolean[];
    completedAt: Date | null;
    updatedBy: string;
  },
  now: Date,
): Promise<void> {
  await db
    .insert(nodeCompletions)
    .values({ ...values, updatedAt: now })
    .onConflictDoUpdate({
      target: [nodeCompletions.enrollmentId, nodeCompletions.runNodeId],
      set: {
        checklistState: values.checklistState,
        completedAt: values.completedAt,
        updatedBy: values.updatedBy,
        updatedAt: now,
      },
    });
}

export async function findRunNode(db: DbOrTx, runId: string, nodeId: string) {
  const [row] = await db
    .select(nodeColumns(runNodes))
    .from(runNodes)
    .where(and(eq(runNodes.runId, runId), eq(runNodes.id, nodeId)));
  return row ?? null;
}

// ---- one-on-one and packages (Coach Office sprint 5b) — read-only over `mentoring` ---------

export async function runKinds(db: DbOrTx, runIds: string[]) {
  if (!runIds.length) return [];
  return db
    .select({ id: programRuns.id, kind: programRuns.kind })
    .from(programRuns)
    .where(inArray(programRuns.id, runIds));
}

export async function goalStatuses(db: DbOrTx, enrollmentIds: string[]) {
  if (!enrollmentIds.length) return [];
  return db
    .select({ enrollmentId: goals.enrollmentId, status: goals.status })
    .from(goals)
    .where(inArray(goals.enrollmentId, enrollmentIds));
}

/** Sessions of the enrollments that may use the package (held or missed). */
export async function usageSessions(db: DbOrTx, enrollmentIds: string[]) {
  if (!enrollmentIds.length) return [];
  const rows = await db
    .select({
      enrollmentId: mentoringSessions.enrollmentId,
      status: mentoringSessions.status,
      countsTowardQuota: mentoringSessions.countsTowardQuota,
    })
    .from(mentoringSessions)
    .where(
      and(
        inArray(mentoringSessions.enrollmentId, enrollmentIds),
        inArray(mentoringSessions.status, ['held', 'no_show']),
      ),
    );
  return rows.map((r) => ({ ...r, enrollmentId: r.enrollmentId as string }));
}
