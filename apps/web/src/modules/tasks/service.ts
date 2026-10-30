import { eq, inArray, isNull, not, or, type SQL, sql } from 'drizzle-orm';
import { type BusinessHoursConfig, slaState } from '@/lib/business-hours';
import { addDays, tehranDay, tehranDayEnd } from '@/lib/tehran-day';
import { normalizeFa, normalizeForSearch } from '@/lib/text-fa';
import { isUuid, uuidv7 } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { ApiError, errors, INVALID_REF_MESSAGE } from '@/server/http/errors';
import { decodeCursor, encodeCursor } from '@/server/http/schemas';
import { assertRefs, type RefCheck } from '../access/refs';
import { loadInScope, scopeCondition, staffStudentScope } from '../access/scope';
import type { TaskTemplateDTO } from '../catalog/contracts';
import {
  getActiveTaskTemplate,
  getBusinessHours,
  getSlaSettings,
  getTasksSettings,
} from '../catalog/service';
import { attachmentsBySubmission, linkAttachmentsToSubmission } from '../files/service';
import { recomputeHealthSafe } from '../health/recompute';
import { notify } from '../notifications/service';
import { touchStudentActivity } from '../students/activity';
import { likePattern } from '../students/policy';
import { students } from '../students/schema';
import { insertProfileSnapshotFromSubmission } from '../students/service';
import { recordTimelineEvent } from '../timeline/events';
import type {
  BulkTasksInput,
  BulkTasksResultDTO,
  CancelTaskInput,
  CreateTaskInput,
  ExtendTaskInput,
  MyTasksQuery,
  ReviewInput,
  ReviewQueueItemDTO,
  ReviewQueueQuery,
  StaffReviewDTO,
  StaffSubmissionDTO,
  StaffTaskDetailDTO,
  StaffTaskDTO,
  StaffTaskListDTO,
  StaffTasksQuery,
  StudentReviewDTO,
  StudentSubmissionDTO,
  StudentTaskDTO,
  StudentTaskListItemDTO,
  StudentTasksQuery,
  SubmissionCreatedDTO,
  SubmitTaskInput,
  TaskStatus,
  UpdateReviewInput,
  UpdateTaskInput,
} from './contracts';
import {
  canEditReview,
  compareForStudent,
  isOverdue,
  nextStatus,
  overdueDays,
  type TaskAction,
  transitionError,
  validateSubmission,
} from './policy';
import * as repo from './repo';
import { TASK_STATUSES, tasks } from './schema';

/**
 * tasks — tasks, submissions, reviews and extensions (PRD F4, api.md section 6,
 * data-model.md 2-5 and 3-1). Every public function takes `actor` first (ADR-0004).
 *
 * Staff reach a task through `loadInScope` (missing and out-of-scope → the same 404);
 * students only their own tasks, with `student_id = actor` checked by the server.
 * Routes shared by both roles pick the DTO with a `switch` whose default is an error
 * (SEC-A5). Every status change writes `status_changed_at` and a `task.status_changed`
 * timeline event in the same transaction.
 * After each commit that changes a health input (create, extend, cancel, start, submit,
 * review) the student's health is recomputed, best-effort (ADR-0005).
 */

/** Runs the write, then recomputes the health of the students it touched (never throws). */
async function healthAfter<T>(db: Db, write: Promise<T>, ids: (result: T) => readonly string[]) {
  const result = await write;
  await recomputeHealthSafe(ids(result), db);
  return result;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

function assertStudent(actor: Actor): void {
  if (actor.role !== 'student') throw errors.forbidden();
}

function invalidTransition(current: TaskStatus, action: TaskAction): ApiError {
  return new ApiError('INVALID_TRANSITION', { message: transitionError(current, action) });
}

// ---- DTO builders (explicit, field by field; ADR-0004 section 3) ----------------------

function stageRefOf(row: {
  stageId: string | null;
  stageName: string | null;
  stageDisplayCode: string | null;
}) {
  return row.stageId && row.stageName && row.stageDisplayCode
    ? { id: row.stageId, name: row.stageName, displayCode: row.stageDisplayCode }
    : null;
}

function toStaffTaskDTO(row: repo.TaskRow, now: Date): StaffTaskDTO {
  return {
    id: row.id,
    student: { id: row.studentId, displayName: row.studentDisplayName },
    title: row.title,
    description: row.description,
    kind: row.kind,
    submissionType: row.submissionType,
    stage: stageRefOf(row),
    requiredForGate: row.requiredForGate,
    priority: row.priority,
    status: row.status,
    dueAt: row.dueAt.toISOString(),
    originalDueAt: row.originalDueAt.toISOString(),
    overdue: isOverdue(row.status, row.dueAt, now),
    overdueDays: overdueDays(row.status, row.dueAt, now),
    reviewer: { id: row.reviewerId, displayName: row.reviewerDisplayName },
    createdBy: { id: row.createdById, displayName: row.createdByDisplayName },
    templateId: row.templateId,
    batchId: row.batchId,
    profile:
      row.profileId && row.profileDeletedAt === null && row.profilePlatformName
        ? { id: row.profileId, platformName: row.profilePlatformName, url: row.profileUrl }
        : null,
    revisionCount: row.revisionCount,
    extensionCount: row.extensionCount,
    statusChangedAt: row.statusChangedAt.toISOString(),
    lastSubmittedAt: iso(row.lastSubmittedAt),
    closedAt: iso(row.closedAt),
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Student view: built from scratch; no reviewer, creator, counters or cancel reason. */
function toStudentListItem(
  row: repo.TaskRow,
  latestReview: StudentTaskListItemDTO['latestReview'],
  now: Date,
): StudentTaskListItemDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    submissionType: row.submissionType,
    stage: stageRefOf(row),
    priority: row.priority,
    status: row.status,
    dueAt: row.dueAt.toISOString(),
    overdue: isOverdue(row.status, row.dueAt, now),
    overdueDays: overdueDays(row.status, row.dueAt, now),
    latestReview,
  };
}

type SubmissionBundle = {
  submissions: Awaited<ReturnType<typeof repo.listSubmissions>>;
  reviews: Map<string, Awaited<ReturnType<typeof repo.listReviews>>[number]>;
  attachments: Awaited<ReturnType<typeof attachmentsBySubmission>>;
};

async function loadSubmissions(db: DbOrTx, taskIds: readonly string[]): Promise<SubmissionBundle> {
  const submissions = await repo.listSubmissions(db, taskIds);
  const ids = submissions.map((s) => s.id);
  const [reviewRows, attachments] = await Promise.all([
    repo.listReviews(db, ids),
    attachmentsBySubmission(db, ids),
  ]);
  return {
    submissions,
    reviews: new Map(reviewRows.map((r) => [r.submissionId, r])),
    attachments,
  };
}

function linksOf(value: unknown): Array<{ url: string; label: string | null }> {
  return Array.isArray(value)
    ? value.map((l: { url: string; label?: string | null }) => ({
        url: l.url,
        label: l.label ?? null,
      }))
    : [];
}

function toStaffSubmissions(actor: Actor, bundle: SubmissionBundle, taskId: string, now: Date) {
  return bundle.submissions
    .filter((s) => s.taskId === taskId)
    .map((s): StaffSubmissionDTO => {
      const review = bundle.reviews.get(s.id);
      const reviewDTO: StaffReviewDTO | null = review
        ? {
            id: review.id,
            reviewer: { id: review.reviewerId, displayName: review.reviewerDisplayName },
            outcome: review.outcome,
            feedbackText: review.feedbackText,
            score: review.score,
            createdAt: review.createdAt.toISOString(),
            updatedAt: review.updatedAt.toISOString(),
            editable:
              canEditReview(review.createdAt, now) &&
              (actor.role === 'admin' || review.reviewerId === actor.userId),
          }
        : null;
      return {
        id: s.id,
        version: s.version,
        bodyText: s.bodyText,
        links: linksOf(s.links),
        platform:
          s.platformId && s.platformName ? { id: s.platformId, name: s.platformName } : null,
        jobPostText: s.jobPostText,
        proposalText: s.proposalText,
        profileText: s.profileText,
        aiUseConsent: s.aiUseConsent,
        submittedBy: { id: s.submittedBy, displayName: s.submittedByDisplayName },
        createdAt: s.createdAt.toISOString(),
        attachments: bundle.attachments.get(s.id) ?? [],
        review: reviewDTO,
      };
    });
}

function toStudentSubmissions(bundle: SubmissionBundle, taskId: string) {
  return bundle.submissions
    .filter((s) => s.taskId === taskId)
    .map((s): StudentSubmissionDTO => {
      const review = bundle.reviews.get(s.id);
      const reviewDTO: StudentReviewDTO | null = review
        ? {
            outcome: review.outcome,
            feedbackText: review.feedbackText,
            score: review.score,
            createdAt: review.createdAt.toISOString(),
            reviewer: { displayName: review.reviewerDisplayName },
          }
        : null;
      return {
        id: s.id,
        version: s.version,
        createdAt: s.createdAt.toISOString(),
        bodyText: s.bodyText,
        links: linksOf(s.links),
        platform:
          s.platformId && s.platformName ? { id: s.platformId, name: s.platformName } : null,
        jobPostText: s.jobPostText,
        proposalText: s.proposalText,
        profileText: s.profileText,
        aiUseConsent: s.aiUseConsent,
        attachments: bundle.attachments.get(s.id) ?? [],
        review: reviewDTO,
      };
    });
}

function latestReviewOf(bundle: SubmissionBundle, taskId: string) {
  // Submissions are ordered newest version first.
  const latest = bundle.submissions.find((s) => s.taskId === taskId);
  const review = latest ? bundle.reviews.get(latest.id) : undefined;
  return review ? { outcome: review.outcome, createdAt: review.createdAt.toISOString() } : null;
}

async function loadTaskRow(db: DbOrTx, taskId: string): Promise<repo.TaskRow> {
  const row = await repo.findTask(db, taskId);
  if (!row) throw errors.notFound();
  return row;
}

async function staffDetail(db: DbOrTx, actor: Actor, taskId: string): Promise<StaffTaskDetailDTO> {
  const now = new Date();
  const row = await loadTaskRow(db, taskId);
  const [bundle, extensions] = await Promise.all([
    loadSubmissions(db, [taskId]),
    repo.listExtensions(db, taskId),
  ]);
  return {
    ...toStaffTaskDTO(row, now),
    submissions: toStaffSubmissions(actor, bundle, taskId, now),
    extensions: extensions.map((e) => ({
      id: e.id,
      previousDueAt: e.previousDueAt.toISOString(),
      newDueAt: e.newDueAt.toISOString(),
      reason: e.reason,
      actor: { id: e.actorId, displayName: e.actorDisplayName },
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

async function studentDetail(db: DbOrTx, taskId: string): Promise<StudentTaskDTO> {
  const now = new Date();
  const row = await loadTaskRow(db, taskId);
  const bundle = await loadSubmissions(db, [taskId]);
  return {
    ...toStudentListItem(row, latestReviewOf(bundle, taskId), now),
    submissions: toStudentSubmissions(bundle, taskId),
  };
}

/** The student's own task, locked or not; anything else → 404 (same body as missing). */
async function assertOwnTask(db: DbOrTx, actor: Actor, taskId: string): Promise<void> {
  const root = isUuid(taskId) ? await repo.findTask(db, taskId) : null;
  if (!root || root.studentId !== actor.userId) throw errors.notFound();
}

// ---- reads -----------------------------------------------------------------------------

/** GET /students/:id/tasks (A, M in scope). */
export async function listStudentTasks(
  actor: Actor,
  studentId: string,
  query: StudentTasksQuery = {},
  db: DbOrTx = getDb(),
): Promise<StaffTaskDTO[]> {
  assertStaff(actor);
  await loadInScope(db, actor, 'student', studentId);
  const now = new Date();
  const rows = await repo.listTasksOfStudent(db, studentId, {
    statuses: query.status,
    stageId: query.stageId,
  });
  return rows.map((r) => toStaffTaskDTO(r, now));
}

const DEFAULT_LIST_LIMIT = 50;

/**
 * GET /tasks (A, M; sprint-3 frontend gap 1): tasks across every student in the actor's
 * scope (SQL, SEC-A2). Read filters are ANDed with the scope and never replace it (ADR-0004
 * 1-1), so an out-of-scope `studentId` / `mentorId` / `reviewerId` only gives an empty list.
 */
export async function listStaffTasks(
  actor: Actor,
  query: StaffTasksQuery = {},
  db: DbOrTx = getDb(),
): Promise<StaffTaskListDTO> {
  assertStaff(actor);
  const offset = decodeCursor(query.cursor);
  if (offset < 0) throw errors.validation({ cursor: 'مقدار نامعتبر است' });
  const limit = query.limit ?? DEFAULT_LIST_LIMIT;
  const now = new Date();
  const scope = await staffStudentScope(db, actor);
  const base: SQL[] = [scopeCondition(scope, students.userId, students.organizationId)];
  if (query.stageId) base.push(eq(tasks.stageId, query.stageId));
  if (query.reviewerId) base.push(eq(tasks.reviewerId, query.reviewerId));
  if (query.mentorId === 'none') base.push(isNull(students.primaryMentorId));
  else if (query.mentorId) base.push(eq(students.primaryMentorId, query.mentorId));
  if (query.studentId) base.push(eq(tasks.studentId, query.studentId));
  if (query.kind) base.push(eq(tasks.kind, query.kind));
  if (query.submissionType) base.push(eq(tasks.submissionType, query.submissionType));
  const studentTerm = query.q ? normalizeForSearch(query.q).replace(/^\+/, '') : '';
  const titleTerm = query.q ? normalizeFa(query.q) : '';
  if (studentTerm || titleTerm) {
    const parts: SQL[] = [];
    if (titleTerm) parts.push(sql`${tasks.title} ILIKE ${likePattern(titleTerm)}`);
    if (studentTerm) parts.push(sql`${students.searchText} ILIKE ${likePattern(studentTerm)}`);
    base.push(or(...parts) ?? sql`false`);
  }
  const filtered = [...base];
  if (query.status) filtered.push(inArray(tasks.status, query.status));
  if (query.overdue === true) filtered.push(repo.overdueCondition(now));
  if (query.overdue === false) filtered.push(not(repo.overdueCondition(now)));
  const [rows, countRows] = await Promise.all([
    repo.listStaffTasks(db, filtered, query.sort ?? 'due', limit + 1, offset),
    repo.countStaffTasks(db, base, now),
  ]);
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<
    TaskStatus,
    number
  >;
  let total = 0;
  let overdue = 0;
  for (const r of countRows) {
    byStatus[r.status] = r.count;
    total += r.count;
    overdue += r.overdue;
  }
  return {
    items: rows.slice(0, limit).map((r) => toStaffTaskDTO(r, now)),
    nextCursor: rows.length > limit ? encodeCursor(offset + limit) : null,
    counts: { total, overdue, byStatus },
  };
}

/** GET /me/tasks (S): overdue first, then by deadline (F4). Cancelled only on request. */
export async function listOwnTasks(
  actor: Actor,
  query: MyTasksQuery = {},
  db: DbOrTx = getDb(),
): Promise<StudentTaskListItemDTO[]> {
  assertStudent(actor);
  const now = new Date();
  const rows = await repo.listTasksOfStudent(db, actor.userId, {
    statuses: query.status ?? ['open', 'in_progress', 'submitted', 'changes_requested', 'accepted'],
  });
  const bundle = await loadSubmissions(
    db,
    rows.map((r) => r.id),
  );
  return rows
    .sort((a, b) => compareForStudent(a, b, now))
    .map((r) => toStudentListItem(r, latestReviewOf(bundle, r.id), now));
}

/**
 * GET /tasks/:id (A, M in scope; S own). The DTO depends on the role; the default branch
 * is an error, never the staff DTO (SEC-A5).
 */
export async function getTask(
  actor: Actor,
  taskId: string,
  db: DbOrTx = getDb(),
): Promise<StaffTaskDetailDTO | StudentTaskDTO> {
  switch (actor.role) {
    case 'student':
      return getOwnTask(actor, taskId, db);
    case 'admin':
    case 'mentor':
      return getStaffTask(actor, taskId, db);
    default:
      throw errors.forbidden();
  }
}

/** Typed variant of GET /tasks/:id for staff pages. */
export async function getStaffTask(
  actor: Actor,
  taskId: string,
  db: DbOrTx = getDb(),
): Promise<StaffTaskDetailDTO> {
  assertStaff(actor);
  await loadInScope(db, actor, 'task', taskId);
  return staffDetail(db, actor, taskId);
}

/** Typed variant of GET /tasks/:id for the student's own task. */
export async function getOwnTask(
  actor: Actor,
  taskId: string,
  db: DbOrTx = getDb(),
): Promise<StudentTaskDTO> {
  assertStudent(actor);
  await assertOwnTask(db, actor, taskId);
  return studentDetail(db, taskId);
}

// ---- create ----------------------------------------------------------------------------

type TaskFields = Omit<CreateTaskInput, 'profileId'>;

/** Template defaults + explicit fields → the values of a new task (with ref checks). */
async function resolveTaskValues(
  tx: DbOrTx,
  actor: Actor,
  input: TaskFields,
  now: Date,
): Promise<{
  template: TaskTemplateDTO | null;
  title: string;
  description: string | null;
  kind: repo.TaskWriteValues['kind'];
  submissionType: repo.TaskWriteValues['submissionType'];
  stageId: string | null;
  requiredForGate: boolean;
  priority: 'normal' | 'urgent';
  dueAt: Date;
}> {
  const refs: RefCheck[] = [];
  if (input.templateId) {
    refs.push({ field: 'templateId', kind: 'catalog', catalog: 'template', id: input.templateId });
  }
  if (input.stageId) {
    refs.push({ field: 'stageId', kind: 'catalog', catalog: 'stage', id: input.stageId });
  }
  if (input.reviewerId) refs.push({ field: 'reviewerId', kind: 'staffUser', id: input.reviewerId });
  await assertRefs(tx, actor, refs);

  const template = input.templateId
    ? await getActiveTaskTemplate(tx, actor.organizationId, input.templateId)
    : null;
  const title = input.title ?? template?.title;
  if (!title) throw errors.validation({ title: 'عنوان کار را وارد کن.' });
  const stageId = input.stageId !== undefined ? input.stageId : (template?.stageId ?? null);
  if (input.stageId === undefined && stageId) {
    // A template's stage may have been deactivated since.
    await assertRefs(tx, actor, [
      { field: 'templateId', kind: 'catalog', catalog: 'stage', id: stageId },
    ]);
  }
  const today = tehranDay(now);
  const dueDate =
    input.dueDate ??
    addDays(
      today,
      template?.defaultDueDays ?? (await getTasksSettings(tx, actor.organizationId)).defaultDueDays,
    );
  if (dueDate < today) throw errors.validation({ dueDate: 'مهلت نمی‌تواند قبل از امروز باشد.' });
  return {
    template,
    title,
    description:
      input.description !== undefined ? input.description : (template?.description ?? null),
    kind: input.kind ?? template?.kind ?? 'custom',
    submissionType: input.submissionType ?? template?.submissionType ?? 'text',
    stageId,
    requiredForGate: input.requiredForGate ?? template?.requiredForGate ?? false,
    priority: input.priority ?? 'normal',
    dueAt: tehranDayEnd(dueDate),
  };
}

/** Default reviewer: the student's active primary mentor, otherwise the actor. */
async function defaultReviewer(tx: DbOrTx, actor: Actor, studentId: string): Promise<string> {
  const mentor = await repo.primaryMentorOf(tx, studentId);
  if (mentor && (await repo.activeStaffIds(tx, actor.organizationId, [mentor])).has(mentor)) {
    return mentor;
  }
  return actor.userId;
}

async function insertTaskFor(
  tx: DbOrTx,
  actor: Actor,
  studentId: string,
  values: Awaited<ReturnType<typeof resolveTaskValues>>,
  extra: { reviewerId?: string; profileId?: string | null; batchId: string | null },
  now: Date,
): Promise<string> {
  const id = await repo.insertTask(
    tx,
    {
      studentId,
      title: values.title,
      description: values.description,
      kind: values.kind,
      submissionType: values.submissionType,
      stageId: values.stageId,
      requiredForGate: values.requiredForGate,
      priority: values.priority,
      dueAt: values.dueAt,
      reviewerId: extra.reviewerId ?? (await defaultReviewer(tx, actor, studentId)),
      createdBy: actor.userId,
      templateId: values.template?.id ?? null,
      batchId: extra.batchId,
      profileId: extra.profileId ?? null,
    },
    now,
  );
  await recordTimelineEvent(tx, {
    studentId,
    type: 'task.created',
    actorId: actor.userId,
    subjectType: 'task',
    subjectId: id,
    data: {
      title: values.title,
      kind: values.kind,
      submissionType: values.submissionType,
      dueAt: values.dueAt.toISOString(),
      ...(extra.batchId ? { batchId: extra.batchId } : {}),
    },
    occurredAt: now,
  });
  await notify(
    tx,
    actor,
    [
      {
        userId: studentId,
        kind: 'task_assigned',
        studentId,
        subjectId: id,
        data: { title: values.title },
      },
    ],
    now,
  );
  return id;
}

/** POST /students/:id/tasks (A, M in scope). */
export async function createTask(
  actor: Actor,
  studentId: string,
  input: CreateTaskInput,
  db: Db = getDb(),
): Promise<StaffTaskDTO> {
  assertStaff(actor);
  return healthAfter(
    db,
    db.transaction(async (tx) => {
      await loadInScope(tx, actor, 'student', studentId);
      const now = new Date();
      if (input.profileId) {
        await assertRefs(tx, actor, [
          { field: 'profileId', kind: 'profileOfStudent', id: input.profileId, studentId },
        ]);
      }
      const values = await resolveTaskValues(tx, actor, input, now);
      const id = await insertTaskFor(
        tx,
        actor,
        studentId,
        values,
        { reviewerId: input.reviewerId, profileId: input.profileId, batchId: null },
        now,
      );
      return toStaffTaskDTO(await loadTaskRow(tx, id), now);
    }),
    () => [studentId],
  );
}

/**
 * POST /tasks/bulk (A, M; Should): one task per student with a shared `batchId`. Every
 * student must be in scope, otherwise 422 and nothing is created (C3).
 */
export async function createTasksInBulk(
  actor: Actor,
  input: BulkTasksInput,
  db: Db = getDb(),
): Promise<BulkTasksResultDTO> {
  assertStaff(actor);
  return healthAfter(
    db,
    db.transaction(async (tx) => {
      const studentIds = [...new Set(input.studentIds)];
      await assertRefs(tx, actor, [
        { field: 'studentIds', kind: 'studentsInScope', ids: studentIds },
      ]);
      const now = new Date();
      const values = await resolveTaskValues(tx, actor, input, now);
      const batchId = uuidv7();
      const taskIds: string[] = [];
      for (const studentId of studentIds) {
        taskIds.push(
          await insertTaskFor(
            tx,
            actor,
            studentId,
            values,
            { reviewerId: input.reviewerId, batchId },
            now,
          ),
        );
      }
      return { batchId, created: taskIds.length, taskIds };
    }),
    () => input.studentIds,
  );
}

// ---- tasks from a program activity (Coach Office sprint 5) ------------------------------

export type ProgramTaskValues = {
  title: string;
  description: string | null;
  submissionType: repo.TaskWriteValues['submissionType'];
  /** Calendar day; the task is due at its end. */
  dueDay: string;
};

export type ProgramTaskTarget = {
  studentId: string;
  enrollmentId: string;
  nodeId: string;
  /** Preferred reviewer; one that is not active staff falls back to the actor. */
  reviewerId: string | null;
};

/**
 * Internal (programs.assignNodeToRun, INSIDE its transaction): one task per target from a
 * program assignment, with a `task.created` timeline event each. The caller recomputes the
 * students' health after the commit. Returns the new task ids.
 */
export async function insertProgramTasks(
  tx: DbOrTx,
  actor: Actor,
  values: ProgramTaskValues,
  targets: readonly ProgramTaskTarget[],
  now: Date,
): Promise<string[]> {
  assertStaff(actor);
  const wanted = [...new Set(targets.map((t) => t.reviewerId).filter((x) => x !== null))];
  const active = await repo.activeStaffIds(tx, actor.organizationId, wanted);
  const dueAt = tehranDayEnd(values.dueDay);
  const ids: string[] = [];
  for (const t of targets) {
    const id = await repo.insertTask(
      tx,
      {
        studentId: t.studentId,
        title: values.title,
        description: values.description,
        kind: 'path_assignment',
        submissionType: values.submissionType,
        stageId: null,
        requiredForGate: false,
        priority: 'normal',
        dueAt,
        reviewerId: t.reviewerId && active.has(t.reviewerId) ? t.reviewerId : actor.userId,
        createdBy: actor.userId,
        templateId: null,
        batchId: null,
        profileId: null,
        enrollmentId: t.enrollmentId,
        nodeId: t.nodeId,
      },
      now,
    );
    await recordTimelineEvent(tx, {
      studentId: t.studentId,
      type: 'task.created',
      actorId: actor.userId,
      subjectType: 'task',
      subjectId: id,
      data: {
        title: values.title,
        kind: 'path_assignment',
        submissionType: values.submissionType,
        dueAt: dueAt.toISOString(),
        enrollmentId: t.enrollmentId,
      },
      occurredAt: now,
    });
    await notify(
      tx,
      actor,
      [
        {
          userId: t.studentId,
          kind: 'task_assigned',
          studentId: t.studentId,
          subjectId: id,
          data: { title: values.title },
        },
      ],
      now,
    );
    ids.push(id);
  }
  return ids;
}

/**
 * Internal (mentoring module, sprint 5b): a session's "next action" for one student — a
 * `follow_up` task the student ticks off, reviewed by the session's mentor (or the actor when
 * that mentor is no longer active staff). The caller has checked access to the session.
 */
export async function insertSessionAction(
  tx: DbOrTx,
  actor: Actor,
  values: {
    title: string;
    description: string | null;
    dueDay: string;
    studentId: string;
    enrollmentId: string | null;
    sessionId: string;
    reviewerId: string;
  },
  now: Date,
): Promise<string> {
  assertStaff(actor);
  const active = await repo.activeStaffIds(tx, actor.organizationId, [values.reviewerId]);
  const dueAt = tehranDayEnd(values.dueDay);
  const id = await repo.insertTask(
    tx,
    {
      studentId: values.studentId,
      title: values.title,
      description: values.description,
      kind: 'follow_up',
      submissionType: 'checkbox',
      stageId: null,
      requiredForGate: false,
      priority: 'normal',
      dueAt,
      reviewerId: active.has(values.reviewerId) ? values.reviewerId : actor.userId,
      createdBy: actor.userId,
      templateId: null,
      batchId: null,
      profileId: null,
      enrollmentId: values.enrollmentId,
      sessionId: values.sessionId,
    },
    now,
  );
  await recordTimelineEvent(tx, {
    studentId: values.studentId,
    type: 'task.created',
    actorId: actor.userId,
    subjectType: 'task',
    subjectId: id,
    data: {
      title: values.title,
      kind: 'follow_up',
      submissionType: 'checkbox',
      dueAt: dueAt.toISOString(),
      sessionId: values.sessionId,
    },
    occurredAt: now,
  });
  await notify(
    tx,
    actor,
    [
      {
        userId: values.studentId,
        kind: 'task_assigned',
        studentId: values.studentId,
        subjectId: id,
        data: { title: values.title },
      },
    ],
    now,
  );
  return id;
}

// ---- tasks of a stage change (sprint-3 frontend gap 4) ---------------------------------

export type StageChangeTaskInput = {
  createTemplateIds?: readonly string[];
  cancelTaskIds?: readonly string[];
  cancelReason?: string | null;
};

export type PreparedStageChangeTasks = {
  create: Array<Awaited<ReturnType<typeof resolveTaskValues>>>;
  cancel: Array<NonNullable<Awaited<ReturnType<typeof repo.lockTask>>>>;
  cancelReason: string;
};

const STAGE_CHANGE_CANCEL_REASON = 'با تغییر مرحله لغو شد.';

/**
 * Checks for the tasks of `PUT /students/:id/stage`, called by path.changeStage INSIDE its
 * transaction and BEFORE any write (ADR-0004 1-1): every `createTemplateIds` entry is an
 * active template (whose stage, if any, is active) and every `cancelTaskIds` entry is a
 * task of THIS student (`taskOfStudent`) → otherwise 422 and nothing is written. Tasks to
 * cancel are locked; one that is already final → 409 INVALID_TRANSITION (whole change
 * rolled back). Ids are de-duplicated.
 */
export async function prepareStageChangeTasks(
  tx: DbOrTx,
  actor: Actor,
  studentId: string,
  input: StageChangeTaskInput,
  now: Date,
): Promise<PreparedStageChangeTasks> {
  assertStaff(actor);
  const templateIds = [...new Set(input.createTemplateIds ?? [])];
  const cancelIds = [...new Set(input.cancelTaskIds ?? [])].sort();
  await assertRefs(tx, actor, [
    ...templateIds.map(
      (id): RefCheck => ({ field: 'createTemplateIds', kind: 'catalog', catalog: 'template', id }),
    ),
    ...cancelIds.map(
      (id): RefCheck => ({ field: 'cancelTaskIds', kind: 'taskOfStudent', id, studentId }),
    ),
  ]);
  const create: PreparedStageChangeTasks['create'] = [];
  for (const templateId of templateIds) {
    try {
      create.push(await resolveTaskValues(tx, actor, { templateId }, now));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        throw errors.validation({ createTemplateIds: INVALID_REF_MESSAGE });
      }
      throw error;
    }
  }
  const cancel: PreparedStageChangeTasks['cancel'] = [];
  for (const taskId of cancelIds) {
    const locked = await repo.lockTask(tx, taskId);
    if (!locked || locked.studentId !== studentId) {
      throw errors.validation({ cancelTaskIds: INVALID_REF_MESSAGE });
    }
    if (!nextStatus(locked.status, 'cancel', locked.submissionType)) {
      throw new ApiError('INVALID_TRANSITION', {
        message: `کار «${locked.title}» دیگر باز نیست و لغو نمی‌شود. صفحه را تازه کن.`,
      });
    }
    cancel.push(locked);
  }
  return { create, cancel, cancelReason: input.cancelReason || STAGE_CHANGE_CANCEL_REASON };
}

/** Writes of `prepareStageChangeTasks`, in the same transaction, after the stage change. */
export async function applyStageChangeTasks(
  tx: DbOrTx,
  actor: Actor,
  studentId: string,
  prepared: PreparedStageChangeTasks,
  now: Date,
): Promise<{ createdTasks: StaffTaskDTO[]; cancelledTaskIds: string[] }> {
  const createdTasks: StaffTaskDTO[] = [];
  for (const values of prepared.create) {
    const id = await insertTaskFor(tx, actor, studentId, values, { batchId: null }, now);
    createdTasks.push(toStaffTaskDTO(await loadTaskRow(tx, id), now));
  }
  for (const locked of prepared.cancel) {
    await changeStatus(
      tx,
      actor,
      locked,
      'cancelled',
      { cancelReason: prepared.cancelReason },
      now,
    );
  }
  return { createdTasks, cancelledTaskIds: prepared.cancel.map((t) => t.id) };
}

// ---- staff writes ----------------------------------------------------------------------

/** Scope check + row lock for a staff write; 404 when missing or out of scope. */
async function lockForStaff(tx: DbOrTx, actor: Actor, taskId: string) {
  assertStaff(actor);
  await loadInScope(tx, actor, 'task', taskId);
  const locked = await repo.lockTask(tx, taskId);
  if (!locked) throw errors.notFound();
  return locked;
}

/** PATCH /tasks/:id (A, M in scope). The deadline only changes through /extend. */
export async function updateTask(
  actor: Actor,
  taskId: string,
  input: UpdateTaskInput,
  db: Db = getDb(),
): Promise<StaffTaskDTO> {
  return db.transaction(async (tx) => {
    const locked = await lockForStaff(tx, actor, taskId);
    if (input.ifUpdatedAt && input.ifUpdatedAt.getTime() !== locked.updatedAt.getTime()) {
      throw errors.conflict('این کار در این فاصله تغییر کرده است. صفحه را تازه کن.');
    }
    const refs: RefCheck[] = [];
    if (input.reviewerId)
      refs.push({ field: 'reviewerId', kind: 'staffUser', id: input.reviewerId });
    if (input.stageId) {
      refs.push({ field: 'stageId', kind: 'catalog', catalog: 'stage', id: input.stageId });
    }
    await assertRefs(tx, actor, refs);
    const values: Parameters<typeof repo.updateTask>[2] = {};
    if (input.title !== undefined) values.title = input.title;
    if (input.description !== undefined) values.description = input.description;
    if (input.priority !== undefined) values.priority = input.priority;
    if (input.reviewerId !== undefined) values.reviewerId = input.reviewerId;
    if (input.stageId !== undefined) values.stageId = input.stageId;
    if (input.requiredForGate !== undefined) values.requiredForGate = input.requiredForGate;
    const fields = Object.keys(values);
    const now = new Date();
    if (fields.length > 0) {
      await repo.updateTask(tx, taskId, values, now);
      await recordTimelineEvent(tx, {
        studentId: locked.studentId,
        type: 'task.updated',
        actorId: actor.userId,
        subjectType: 'task',
        subjectId: taskId,
        data: { fields },
        occurredAt: now,
      });
    }
    return toStaffTaskDTO(await loadTaskRow(tx, taskId), now);
  });
}

/**
 * POST /tasks/:id/extend (A, M in scope): a later deadline + reason, in any non-final
 * status. `extension_count + 1` and the history row in the same transaction (R-EXTEND).
 */
export async function extendTask(
  actor: Actor,
  taskId: string,
  input: ExtendTaskInput,
  db: Db = getDb(),
): Promise<StaffTaskDTO> {
  return healthAfter(
    db,
    db.transaction(async (tx) => {
      const locked = await lockForStaff(tx, actor, taskId);
      if (locked.status === 'accepted' || locked.status === 'cancelled') {
        throw invalidTransition(locked.status, 'cancel');
      }
      const now = new Date();
      const newDueAt = tehranDayEnd(input.newDueDate);
      if (input.newDueDate < tehranDay(now)) {
        throw errors.validation({ newDueDate: 'مهلت تازه نمی‌تواند قبل از امروز باشد.' });
      }
      if (newDueAt.getTime() <= locked.dueAt.getTime()) {
        throw errors.validation({ newDueDate: 'مهلت تازه باید بعد از مهلت فعلی باشد.' });
      }
      await repo.insertExtension(
        tx,
        {
          taskId,
          previousDueAt: locked.dueAt,
          newDueAt,
          reason: input.reason,
          actorId: actor.userId,
        },
        now,
      );
      await repo.updateTask(
        tx,
        taskId,
        { dueAt: newDueAt, extensionCount: repo.increment(tasks.extensionCount) },
        now,
      );
      await recordTimelineEvent(tx, {
        studentId: locked.studentId,
        type: 'task.due_extended',
        actorId: actor.userId,
        subjectType: 'task',
        subjectId: taskId,
        data: { from: locked.dueAt.toISOString(), to: newDueAt.toISOString() },
        occurredAt: now,
      });
      return toStaffTaskDTO(await loadTaskRow(tx, taskId), now);
    }),
    (r) => [r.student.id],
  );
}

async function changeStatus(
  tx: DbOrTx,
  actor: Actor,
  locked: { id: string; studentId: string; status: TaskStatus },
  to: TaskStatus,
  extra: Parameters<typeof repo.updateTask>[2],
  now: Date,
): Promise<void> {
  const final = to === 'accepted' || to === 'cancelled';
  await repo.updateTask(
    tx,
    locked.id,
    { ...extra, status: to, statusChangedAt: now, ...(final ? { closedAt: now } : {}) },
    now,
  );
  await recordTimelineEvent(tx, {
    studentId: locked.studentId,
    type: 'task.status_changed',
    actorId: actor.userId,
    subjectType: 'task',
    subjectId: locked.id,
    data: { from: locked.status, to },
    occurredAt: now,
  });
}

/** POST /tasks/:id/cancel (A, M in scope): any non-final status → cancelled (reason). */
export async function cancelTask(
  actor: Actor,
  taskId: string,
  input: CancelTaskInput,
  db: Db = getDb(),
): Promise<StaffTaskDTO> {
  return healthAfter(
    db,
    db.transaction(async (tx) => {
      const locked = await lockForStaff(tx, actor, taskId);
      const to = nextStatus(locked.status, 'cancel', locked.submissionType);
      if (!to) throw invalidTransition(locked.status, 'cancel');
      const now = new Date();
      await changeStatus(tx, actor, locked, to, { cancelReason: input.reason }, now);
      return toStaffTaskDTO(await loadTaskRow(tx, taskId), now);
    }),
    (r) => [r.student.id],
  );
}

/**
 * "Next-version deadline" of a review (gap 3): `null` when absent or equal to the current
 * deadline. Only with `changes_requested`, and not before today (Tehran); an earlier date
 * than the current deadline is allowed (the next round may be shorter).
 */
function nextDueAtOf(input: ReviewInput, now: Date, currentDueAt: Date): Date | null {
  if (input.nextDueDate === undefined) return null;
  if (input.outcome !== 'changes_requested') {
    throw errors.validation({
      nextDueDate: 'مهلت نسخه‌ی بعد فقط وقتی معنا دارد که اصلاح خواسته شود.',
    });
  }
  if (input.nextDueDate < tehranDay(now)) {
    throw errors.validation({ nextDueDate: 'مهلت نسخه‌ی بعد نمی‌تواند قبل از امروز باشد.' });
  }
  const dueAt = tehranDayEnd(input.nextDueDate);
  return dueAt.getTime() === currentDueAt.getTime() ? null : dueAt;
}

/**
 * POST /submissions/:id/review (A, M in scope): only the LATEST version of a `submitted`
 * task. `changes_requested` → revision_count + 1 (R-LOOP), and with `nextDueDate` the new
 * deadline in the same transaction (not counted as an extension). Returns the refreshed task.
 */
export async function reviewSubmission(
  actor: Actor,
  submissionId: string,
  input: ReviewInput,
  db: Db = getDb(),
): Promise<StaffTaskDetailDTO> {
  assertStaff(actor);
  const taskId = await db.transaction(async (tx) => {
    const { resource } = await loadInScope<{ id: string; taskId: string }>(
      tx,
      actor,
      'submission',
      submissionId,
    );
    const locked = await repo.lockTask(tx, resource.taskId);
    if (!locked) throw errors.notFound();
    const latest = await repo.latestSubmission(tx, locked.id);
    if (!latest || latest.id !== submissionId) {
      throw new ApiError('INVALID_TRANSITION', {
        message: 'فقط آخرین نسخه‌ی تحویل را می‌شود بازبینی کرد.',
      });
    }
    const action: TaskAction = input.outcome === 'accepted' ? 'review_accept' : 'review_changes';
    const to = nextStatus(locked.status, action, locked.submissionType);
    if (!to) throw invalidTransition(locked.status, action);
    const now = new Date();
    const nextDueAt = nextDueAtOf(input, now, locked.dueAt);
    const reviewId = await repo.insertReview(
      tx,
      {
        submissionId,
        reviewerId: actor.userId,
        outcome: input.outcome,
        feedbackText: input.feedbackText,
        score: input.score ?? null,
      },
      now,
    );
    await recordTimelineEvent(tx, {
      studentId: locked.studentId,
      type: 'review.created',
      actorId: actor.userId,
      subjectType: 'review',
      subjectId: reviewId,
      data: {
        taskId: locked.id,
        version: latest.version,
        outcome: input.outcome,
        score: input.score ?? null,
        ...(nextDueAt
          ? { previousDueAt: locked.dueAt.toISOString(), nextDueAt: nextDueAt.toISOString() }
          : {}),
      },
      occurredAt: now,
    });
    await notify(
      tx,
      actor,
      [
        {
          userId: locked.studentId,
          kind: 'task_reviewed',
          studentId: locked.studentId,
          subjectId: locked.id,
          data: { title: locked.title, outcome: input.outcome },
        },
      ],
      now,
    );
    await changeStatus(
      tx,
      actor,
      locked,
      to,
      input.outcome === 'changes_requested'
        ? {
            revisionCount: repo.increment(tasks.revisionCount),
            ...(nextDueAt ? { dueAt: nextDueAt } : {}),
          }
        : {},
      now,
    );
    return locked.id;
  });
  const detail = await staffDetail(db, actor, taskId);
  await recomputeHealthSafe(detail.student.id, db);
  return detail;
}

/**
 * PATCH /reviews/:id (A; M = the reviewer AND the student in the current scope — C3,
 * SEC-A6). Text and score only, within 24 hours; the outcome never changes.
 */
export async function updateReview(
  actor: Actor,
  reviewId: string,
  input: UpdateReviewInput,
  db: Db = getDb(),
): Promise<StaffReviewDTO> {
  assertStaff(actor);
  return db.transaction(async (tx) => {
    const { resource } = await loadInScope<{ id: string; reviewerId: string }>(
      tx,
      actor,
      'review',
      reviewId,
    );
    if (actor.role !== 'admin' && resource.reviewerId !== actor.userId) throw errors.notFound();
    const locked = await repo.lockReview(tx, reviewId);
    if (!locked) throw errors.notFound();
    const now = new Date();
    if (!canEditReview(locked.createdAt, now)) {
      throw errors.conflict('مهلت ویرایش بازخورد (۲۴ ساعت) گذشته است.');
    }
    const values: Parameters<typeof repo.updateReview>[2] = {};
    if (input.feedbackText !== undefined) values.feedbackText = input.feedbackText;
    if (input.score !== undefined) values.score = input.score;
    if (Object.keys(values).length > 0) await repo.updateReview(tx, reviewId, values, now);
    const [row] = await repo.listReviews(tx, [locked.submissionId]);
    if (!row) throw errors.notFound();
    return {
      id: row.id,
      reviewer: { id: row.reviewerId, displayName: row.reviewerDisplayName },
      outcome: row.outcome,
      feedbackText: row.feedbackText,
      score: row.score,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      editable: canEditReview(row.createdAt, now),
    };
  });
}

// ---- student writes --------------------------------------------------------------------

/** Lock of the student's own task; anything else → 404. */
async function lockOwn(tx: DbOrTx, actor: Actor, taskId: string) {
  assertStudent(actor);
  if (!isUuid(taskId)) throw errors.notFound();
  const locked = await repo.lockTask(tx, taskId);
  if (!locked || locked.studentId !== actor.userId) throw errors.notFound();
  return locked;
}

/** POST /tasks/:id/start (S): open → in_progress (optional step). */
export async function startTask(
  actor: Actor,
  taskId: string,
  db: Db = getDb(),
): Promise<StudentTaskDTO> {
  await db.transaction(async (tx) => {
    const locked = await lockOwn(tx, actor, taskId);
    const to = nextStatus(locked.status, 'start', locked.submissionType);
    if (!to) throw invalidTransition(locked.status, 'start');
    await changeStatus(tx, actor, locked, to, {}, new Date());
  });
  await recomputeHealthSafe(actor.userId, db);
  return studentDetail(db, taskId);
}

/**
 * POST /tasks/:id/submissions (S): a new version from open / in_progress /
 * changes_requested. Checkbox tasks are accepted at once. Attachments are linked
 * atomically (C4). A task with `profile_id` also writes a profile snapshot — the profile
 * comes from the task, never from the body (C3).
 */
export async function submitTask(
  actor: Actor,
  taskId: string,
  input: SubmitTaskInput,
  db: Db = getDb(),
): Promise<SubmissionCreatedDTO> {
  return healthAfter(
    db,
    db.transaction(async (tx) => {
      const locked = await lockOwn(tx, actor, taskId);
      const to = nextStatus(locked.status, 'submit', locked.submissionType);
      if (!to) throw invalidTransition(locked.status, 'submit');
      const problems = validateSubmission(locked.submissionType, input);
      if (Object.keys(problems).length > 0) throw errors.validation(problems);
      if (input.platformId) {
        await assertRefs(tx, actor, [
          { field: 'platformId', kind: 'catalog', catalog: 'platform', id: input.platformId },
        ]);
      }
      const now = new Date();
      const consent = input.aiUseConsent === true;
      const created = await repo.insertSubmission(
        tx,
        {
          taskId,
          version: await repo.nextVersion(tx, taskId),
          bodyText: input.bodyText ?? null,
          links: (input.links ?? []).map((l) => ({ url: l.url, label: l.label ?? null })),
          platformId: input.platformId ?? null,
          jobPostText: input.jobPostText ?? null,
          proposalText: input.proposalText ?? null,
          profileText: input.profileText ?? null,
          aiUseConsent: consent,
          aiUseConsentAt: consent ? now : null,
          submittedBy: actor.userId,
        },
        now,
      );
      await linkAttachmentsToSubmission(tx, actor.userId, input.attachmentIds, created.id);
      const snapshotText = input.profileText ?? input.bodyText ?? null;
      if (locked.profileId && snapshotText) {
        await insertProfileSnapshotFromSubmission(tx, {
          profileId: locked.profileId,
          studentId: locked.studentId,
          bodyText: snapshotText,
          createdBy: actor.userId,
          sourceSubmissionId: created.id,
        });
      }
      await recordTimelineEvent(tx, {
        studentId: locked.studentId,
        type: 'submission.created',
        actorId: actor.userId,
        subjectType: 'submission',
        subjectId: created.id,
        data: { taskId, version: created.version },
        occurredAt: now,
      });
      await notify(
        tx,
        actor,
        [
          {
            userId: locked.reviewerId,
            kind: 'task_submitted',
            studentId: locked.studentId,
            subjectId: taskId,
            data: { title: locked.title },
          },
        ],
        now,
      );
      await changeStatus(tx, actor, locked, to, { lastSubmittedAt: now }, now);
      await touchStudentActivity(tx, actor.userId, now);
      return {
        id: created.id,
        version: created.version,
        createdAt: created.createdAt.toISOString(),
        task: { id: taskId, status: to },
      };
    }),
    () => [actor.userId],
  );
}

// ---- review queue ----------------------------------------------------------------------

/**
 * Submitted tasks in the actor's scope (SQL, SEC-A2), oldest first, with the review SLA on
 * the configured clock (decision E6: business hours). `reviewerId` filters by reviewer.
 * Threshold (F-09, mentor-workflow.md section 4): `sla.reviewHours` (48) for gate tasks,
 * `sla.reviewHoursNonGate` (72) for the others; "Today" and its counters reuse these items.
 */
export async function reviewQueueFor(
  db: DbOrTx,
  actor: Actor,
  filters: repo.ReviewQueueFilters,
  now: Date,
): Promise<ReviewQueueItemDTO[]> {
  const scope = await staffStudentScope(db, actor);
  const [rows, sla, hours] = await Promise.all([
    repo.listReviewQueue(
      db,
      scopeCondition(scope, students.userId, students.organizationId),
      filters,
    ),
    getSlaSettings(db, actor.organizationId),
    getBusinessHours(db, actor.organizationId),
  ]);
  return rows.map((r) => {
    const since = r.lastSubmittedAt ?? now;
    const slaHours = reviewSlaHours(r.requiredForGate, sla);
    const state = slaState(since, now, slaHours, sla.clock, hours as BusinessHoursConfig);
    return {
      taskId: r.taskId,
      title: r.title,
      student: { id: r.studentId, displayName: r.studentDisplayName },
      stage: stageRefOf(r),
      reviewer: { id: r.reviewerId, displayName: r.reviewerDisplayName },
      requiredForGate: r.requiredForGate,
      priority: r.priority,
      submissionType: r.submissionType,
      dueAt: r.dueAt.toISOString(),
      submissionId: r.submissionId,
      version: r.version,
      lastSubmittedAt: since.toISOString(),
      slaHours,
      elapsedHours: state.elapsedHours,
      slaRemainingHours: state.remainingHours,
      breached: state.breached,
      warning: state.warning,
      program: r.runId
        ? { runId: r.runId, title: r.runTitle ?? '', isLegacy: r.legacyPathId !== null }
        : null,
    };
  });
}

/**
 * Internal (mentor directory, Coach Office sprint 4): submitted tasks past their review SLA,
 * counted per reviewer, over the whole organization.
 */
export async function breachedReviewsByReviewer(
  db: DbOrTx,
  organizationId: string,
  now: Date,
): Promise<Map<string, number>> {
  const scope = scopeCondition(
    { kind: 'all', organizationId },
    students.userId,
    students.organizationId,
  );
  const [rows, sla, hours] = await Promise.all([
    repo.listReviewQueue(db, scope),
    getSlaSettings(db, organizationId),
    getBusinessHours(db, organizationId),
  ]);
  const out = new Map<string, number>();
  for (const r of rows) {
    const slaHours = reviewSlaHours(r.requiredForGate, sla);
    const state = slaState(
      r.lastSubmittedAt ?? now,
      now,
      slaHours,
      sla.clock,
      hours as BusinessHoursConfig,
    );
    if (state.breached) out.set(r.reviewerId, (out.get(r.reviewerId) ?? 0) + 1);
  }
  return out;
}

/** F-09: the review SLA of one task (hours). */
export function reviewSlaHours(
  requiredForGate: boolean,
  sla: { reviewHours: number; reviewHoursNonGate: number },
): number {
  return requiredForGate ? sla.reviewHours : sla.reviewHoursNonGate;
}

/** GET /review-queue (A, M). `mentorId` = reviewer filter (ANDed with the scope). */
export async function getReviewQueue(
  actor: Actor,
  query: ReviewQueueQuery = {},
  db: DbOrTx = getDb(),
): Promise<ReviewQueueItemDTO[]> {
  assertStaff(actor);
  const items = await reviewQueueFor(
    db,
    actor,
    { reviewerId: query.mentorId, runId: query.runId, studentId: query.studentId },
    new Date(),
  );
  if (!query.sla) return items;
  return items.filter((i) =>
    query.sla === 'breached'
      ? i.breached
      : query.sla === 'warning'
        ? !i.breached && i.warning
        : !i.breached && !i.warning,
  );
}

/**
 * Internal (CSV export, admin only — the caller checks the role and audits): every task with
 * the columns of `GET /exports/tasks.csv` (SEC-V3: no submission text, no feedback).
 */
export async function listTasksForExport(db: DbOrTx, organizationId: string) {
  const now = new Date();
  return (await repo.listAllTasks(db, organizationId)).map((row) => ({
    studentName: row.studentDisplayName,
    title: row.title,
    kind: row.kind,
    submissionType: row.submissionType,
    stageCode: row.stageDisplayCode,
    status: row.status,
    dueAt: row.dueAt,
    overdue: isOverdue(row.status, row.dueAt, now),
    overdueDays: overdueDays(row.status, row.dueAt, now),
    revisionCount: row.revisionCount,
    extensionCount: row.extensionCount,
    reviewerName: row.reviewerDisplayName,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
  }));
}
