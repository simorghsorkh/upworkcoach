import type { SQL } from 'drizzle-orm';
import { normalizeIranMobile } from '@/lib/phone';
import { tehranDay } from '@/lib/tehran-day';
import { normalizeFa, normalizeForSearch } from '@/lib/text-fa';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { ApiError, errors } from '@/server/http/errors';
import { decodeCursor, encodeCursor } from '@/server/http/schemas';
import { assertRefs, type RefCheck } from '../access/refs';
import { isAssigneeOfOpenThread } from '../access/repo';
import { loadInScope, scopeCondition, staffStudentScope } from '../access/scope';
import { recordAudit } from '../admin/service';
import {
  type AuditMeta,
  getAccessSettings,
  getFirstActiveStage,
  getStage,
} from '../catalog/service';
import { recomputeHealthSafe } from '../health/recompute';
import { toHealthSummary } from '../health/summary';
import { createInvitedUser, inviteUrlFor } from '../identity/service';
import { insertTransition } from '../path/transitions';
import { coursePhasesOf } from '../programs/course-phases';
import { transferOpenQuestionsOnMentorChange } from '../questions/transfer';
import {
  cancelPauseReturnReminders,
  schedulePauseReturnReminder,
  transferRemindersOnMentorChange,
} from '../reminders/service';
import { openTasksOfStudent, type TaskStats, taskStatsForStudents } from '../tasks/counts';
import { recordTimelineEvent } from '../timeline/events';
import { insertInitialNote } from '../timeline/service';
import type {
  CreateProfileInput,
  CreateSnapshotInput,
  CreateStudentInput,
  LifecycleStatus,
  ListStudentsQuery,
  PrimaryProfileDTO,
  ProfileDTO,
  ProfileSnapshotDTO,
  SelfStudentDTO,
  StaffStudentDTO,
  StudentCreatedDTO,
  StudentListDTO,
  StudentListItemDTO,
  StudentSummaryDTO,
  StudentTagsDTO,
  StudentTagsQuery,
  UpdateOwnStudentInput,
  UpdateProfileInput,
  UpdateStudentInput,
} from './contracts';
import {
  buildCounts,
  buildSearchText,
  changeMentorDecision,
  completeness,
  createStudentDecision,
  type Decision,
  daysSince,
  likePattern,
  mentorForNewStudent,
  overExpected,
  staffOnly,
  studentOnly,
} from './policy';
import * as repo from './repo';
import { students } from './schema';

/**
 * students — the only entry point of the module (tech-stack.md section 3).
 *
 * Every public function takes `actor` first and checks access itself (ADR-0004), so RSC
 * pages call these directly and get exactly what the API returns. Staff reads of a single
 * student go through `access.loadInScope` (missing and out-of-scope → the same 404);
 * `/me` functions take the student id from the session only, never from input.
 * Reference ids in bodies are checked with `assertRefs` inside the write transaction (C3).
 */

const DEFAULT_LIMIT = 50;
const DEFAULT_LIFECYCLE: LifecycleStatus[] = ['active', 'paused'];

function assertDecision(decision: Decision): void {
  if (decision === 'forbidden') throw errors.forbidden();
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function assertNotStale(current: Date, ifUpdatedAt: string | undefined): void {
  if (ifUpdatedAt !== undefined && new Date(ifUpdatedAt).getTime() !== current.getTime()) {
    throw errors.conflict('این پرونده در این فاصله تغییر کرده است. صفحه را تازه کن.');
  }
}

/** Copies only the keys that are present (PATCH semantics: absent = unchanged). */
function pick<T extends object, K extends keyof T>(
  input: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) if (input[key] !== undefined) out[key] = input[key];
  return out;
}

// ---- DTO builders (explicit, field by field; ADR-0004 section 3) ----------------------

function toPrimaryProfile(row: repo.ProfileRow | undefined): PrimaryProfileDTO | null {
  return row
    ? { id: row.id, platformName: row.platformName, url: row.publicUrl, headline: row.headline }
    : null;
}

const NO_TASKS: TaskStats = { open: 0, overdue: 0, next: null };

function toStaffDTO(
  row: repo.StudentRow,
  primary: repo.ProfileRow | undefined,
  now: Date = new Date(),
  stats: TaskStats = NO_TASKS,
): StaffStudentDTO {
  const days = daysSince(row.stageEnteredAt, now);
  const stage = { expectedDays: row.stageExpectedDays, isOpenEnded: row.stageIsOpenEnded };
  return {
    id: row.id,
    displayName: row.displayName,
    phone: row.erasedAt ? null : row.phone,
    accountStatus: row.accountStatus,
    erased: row.erasedAt !== null,
    inviteAcceptedAt: iso(row.inviteAcceptedAt),
    inviteAcceptedDevice: row.erasedAt ? null : row.inviteAcceptedUserAgent,
    mentor:
      row.primaryMentorId && row.mentorDisplayName
        ? { id: row.primaryMentorId, displayName: row.mentorDisplayName }
        : null,
    lifecycleStatus: row.lifecycleStatus,
    pausedUntil: row.pausedUntil,
    statusReason: row.statusReason,
    stage: { ...staffStageRef(row), ...stage },
    stageEnteredAt: row.stageEnteredAt.toISOString(),
    daysInStage: days,
    overExpected: overExpected(days, stage),
    track:
      row.trackId && row.trackName && row.trackCode
        ? { id: row.trackId, code: row.trackCode, name: row.trackName }
        : null,
    primaryPlatform:
      row.primaryPlatformId && row.primaryPlatformName
        ? { id: row.primaryPlatformId, name: row.primaryPlatformName }
        : null,
    level: row.level,
    cohort: row.cohort,
    tags: row.tags,
    messengerHandle: row.messengerHandle,
    primarySkill: row.primarySkill,
    skillLevel: row.skillLevel,
    englishWriting: row.englishWriting,
    englishSpeaking: row.englishSpeaking,
    hoursPerWeek: row.hoursPerWeek,
    incomeGoalUsd: row.incomeGoalUsd,
    goal90d: row.goal90d,
    priorExperience: row.priorExperience,
    selfReportedBlocker: row.selfReportedBlocker,
    nicheStatement: row.nicheStatement,
    joinedAt: row.joinedAt.toISOString(),
    lastActivityAt: iso(row.lastActivityAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    health: toHealthSummary(row, now),
    nextTask: stats.next,
    openTaskCount: stats.open,
    overdueTaskCount: stats.overdue,
    primaryProfile: toPrimaryProfile(primary),
    completeness: completeness({
      mentor: row.primaryMentorId !== null,
      track: row.trackId !== null,
      primaryPlatform: row.primaryPlatformId !== null,
      level: row.level !== null,
      primarySkill: row.primarySkill !== null,
      nicheStatement: row.nicheStatement !== null,
      messengerHandle: row.messengerHandle !== null,
      englishWriting: row.englishWriting !== null,
      hoursPerWeek: row.hoursPerWeek !== null,
      incomeGoalUsd: row.incomeGoalUsd !== null,
      goal90d: row.goal90d !== null,
      primaryProfile: primary !== undefined,
    }),
  };
}

/** Stage of a staff DTO with its place in the path (sprint-2 frontend gap 4). */
function staffStageRef(row: repo.StudentRow) {
  return {
    id: row.currentStageId,
    name: row.stageName,
    displayCode: row.stageDisplayCode,
    sortOrder: row.stageSortOrder,
    isActive: row.stageIsActive,
  };
}

function toListItem(
  row: repo.StudentRow,
  primary: repo.ProfileRow | undefined,
  now: Date,
  stats: TaskStats = NO_TASKS,
  courses: StudentListItemDTO['courses'] = [],
): StudentListItemDTO {
  const days = daysSince(row.stageEnteredAt, now);
  return {
    id: row.id,
    displayName: row.displayName,
    accountStatus: row.accountStatus,
    mentor:
      row.primaryMentorId && row.mentorDisplayName
        ? { id: row.primaryMentorId, displayName: row.mentorDisplayName }
        : null,
    stage: staffStageRef(row),
    daysInStage: days,
    overExpected: overExpected(days, {
      expectedDays: row.stageExpectedDays,
      isOpenEnded: row.stageIsOpenEnded,
    }),
    lifecycleStatus: row.lifecycleStatus,
    health: toHealthSummary(row, now),
    nextTask: stats.next,
    openTaskCount: stats.open,
    overdueTaskCount: stats.overdue,
    lastActivityAt: iso(row.lastActivityAt),
    tags: row.tags,
    cohort: row.cohort,
    primaryProfile: toPrimaryProfile(primary),
    courses,
  };
}

/** Student view: built from scratch, never by removing fields from the staff DTO. */
function toSelfDTO(row: repo.StudentRow, now: Date = new Date()): SelfStudentDTO {
  return {
    id: row.id,
    displayName: row.displayName,
    phone: row.phone,
    mentor: row.mentorDisplayName ? { displayName: row.mentorDisplayName } : null,
    stage: { id: row.currentStageId, name: row.stageName, displayCode: row.stageDisplayCode },
    stageEnteredAt: row.stageEnteredAt.toISOString(),
    daysInStage: daysSince(row.stageEnteredAt, now),
    track: row.trackId && row.trackName ? { id: row.trackId, name: row.trackName } : null,
    primaryPlatform:
      row.primaryPlatformId && row.primaryPlatformName
        ? { id: row.primaryPlatformId, name: row.primaryPlatformName }
        : null,
    messengerHandle: row.messengerHandle,
    primarySkill: row.primarySkill,
    skillLevel: row.skillLevel,
    englishWriting: row.englishWriting,
    englishSpeaking: row.englishSpeaking,
    hoursPerWeek: row.hoursPerWeek,
    incomeGoalUsd: row.incomeGoalUsd,
    goal90d: row.goal90d,
    priorExperience: row.priorExperience,
    selfReportedBlocker: row.selfReportedBlocker,
    nicheStatement: row.nicheStatement,
    joinedAt: row.joinedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toProfileDTO(row: repo.ProfileRow): ProfileDTO {
  return {
    id: row.id,
    platform: { id: row.platformId, name: row.platformName },
    kind: row.kind,
    publicUrl: row.publicUrl,
    headline: row.headline,
    rateAmount: row.rateAmount,
    rateCurrency: row.rateCurrency,
    rateUnit: row.rateUnit,
    status: row.status,
    niche: row.niche,
    notes: row.notes,
    isPrimary: row.isPrimary,
    mentorApprovedAt: iso(row.mentorApprovedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSnapshotDTO(row: {
  id: string;
  headline: string | null;
  bodyText: string;
  rateText: string | null;
  createdAt: Date;
}): ProfileSnapshotDTO {
  return {
    id: row.id,
    headline: row.headline,
    bodyText: row.bodyText,
    rateText: row.rateText,
    createdAt: row.createdAt.toISOString(),
  };
}

async function primaryProfileOf(db: DbOrTx, studentId: string) {
  return (await repo.listProfiles(db, [studentId])).find((p) => p.isPrimary);
}

/** Internal: staff DTO without access checks — only after the caller checked access. */
export async function loadStaffStudentDTO(db: DbOrTx, studentId: string): Promise<StaffStudentDTO> {
  const row = await repo.findStudent(db, studentId);
  if (!row) throw errors.notFound();
  const now = new Date();
  const stats = (await taskStatsForStudents(db, [studentId], now)).get(studentId);
  return toStaffDTO(row, await primaryProfileOf(db, studentId), now, stats);
}

/** Staff + scope check for a student path id (403 for students, 404 outside the scope). */
async function assertStaffStudent(db: DbOrTx, actor: Actor, studentId: string): Promise<void> {
  assertDecision(staffOnly(actor));
  await loadInScope(db, actor, 'student', studentId);
}

// ---- create ----------------------------------------------------------------------------

/**
 * POST /students (A; M while `mentorsCanInviteStudents`): users(invited) + students +
 * mentor_assignments + stage_transitions(initial) + invite token, in one transaction
 * (overview.md 4-1). A mentor always becomes the primary mentor (body value ignored).
 */
export async function createStudent(
  actor: Actor,
  input: CreateStudentInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<StudentCreatedDTO> {
  assertDecision(staffOnly(actor));
  assertDecision(createStudentDecision(actor, await getAccessSettings(db, actor.organizationId)));
  const mentorId = mentorForNewStudent(actor, input.mentorId);
  let created: StudentCreatedDTO;
  try {
    created = await createStudentTx(actor, input, mentorId, meta, db);
  } catch (err) {
    throw await withExistingStudent(db, actor, input.phone, err);
  }
  await recomputeHealthSafe(created.student.id, db);
  return { ...created, student: await loadStaffStudentDTO(db, created.student.id) };
}

/**
 * Sprint-2 frontend gap 6: a 409 PHONE_TAKEN for an admin carries
 * `error.data.existingStudentId` ("Go to the existing record") when the phone belongs to a
 * student (admins see every student). Mentors get the plain 409.
 */
async function withExistingStudent(
  db: DbOrTx,
  actor: Actor,
  phone: string,
  err: unknown,
): Promise<unknown> {
  if (!(err instanceof ApiError) || err.code !== 'PHONE_TAKEN' || actor.role !== 'admin') {
    return err;
  }
  const normalized = normalizeIranMobile(phone);
  const id = normalized
    ? await repo.findStudentIdByPhone(db, actor.organizationId, normalized)
    : null;
  return id ? errors.phoneTaken({ existingStudentId: id }) : err;
}

async function createStudentTx(
  actor: Actor,
  input: CreateStudentInput,
  mentorId: string | null,
  meta: AuditMeta,
  db: Db,
): Promise<StudentCreatedDTO> {
  return db.transaction(async (tx) => {
    const refs: RefCheck[] = [];
    if (actor.role === 'admin' && mentorId) {
      refs.push({ field: 'mentorId', kind: 'staffUser', id: mentorId });
    }
    if (input.stageId)
      refs.push({ field: 'stageId', kind: 'catalog', catalog: 'stage', id: input.stageId });
    if (input.trackId)
      refs.push({ field: 'trackId', kind: 'catalog', catalog: 'track', id: input.trackId });
    if (input.primaryPlatformId) {
      refs.push({
        field: 'primaryPlatformId',
        kind: 'catalog',
        catalog: 'platform',
        id: input.primaryPlatformId,
      });
    }
    await assertRefs(tx, actor, refs);
    const org = actor.organizationId;
    const stage = input.stageId
      ? await getStage(tx, org, input.stageId)
      : await getFirstActiveStage(tx, org);
    if (!stage) throw errors.validation({ stageId: 'مقدار نامعتبر است' });

    const created = await createInvitedUser(tx, {
      role: 'student',
      displayName: input.displayName,
      phone: input.phone,
      createdBy: actor.userId,
      organizationId: org,
    });
    const now = new Date();
    const tags = input.tags ?? [];
    await repo.insertStudent(
      tx,
      {
        organizationId: org,
        userId: created.userId,
        primaryMentorId: mentorId,
        currentStageId: stage.id,
        stageEnteredAt: now,
        trackId: input.trackId ?? null,
        primaryPlatformId: input.primaryPlatformId ?? null,
        tags,
        searchText: buildSearchText({
          displayName: input.displayName,
          phone: input.phone,
          messengerHandle: null,
          tags,
        }),
      },
      now,
    );
    if (mentorId) {
      await repo.insertPrimaryAssignment(
        tx,
        { studentId: created.userId, mentorId, assignedBy: actor.userId, reason: null },
        now,
      );
    }
    await insertTransition(
      tx,
      {
        studentId: created.userId,
        fromStageId: null,
        toStageId: stage.id,
        kind: 'initial',
        note: null,
        actorId: actor.userId,
      },
      now,
    );
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'user.invited',
      targetType: 'user',
      targetId: created.userId,
      data: { role: 'student' },
      ip: meta.ip ?? null,
    });
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'user.invite_link_created',
      targetType: 'user',
      targetId: created.userId,
      data: { creatorRole: actor.role, targetRole: 'student' },
      ip: meta.ip ?? null,
    });
    await recordTimelineEvent(tx, {
      studentId: created.userId,
      type: 'student.created',
      actorId: actor.userId,
      data: { stageId: stage.id, mentorId },
      occurredAt: now,
    });
    if (input.initialNote) {
      await insertInitialNote(
        tx,
        { studentId: created.userId, authorId: actor.userId, body: input.initialNote },
        now,
      );
    }
    return {
      student: await loadStaffStudentDTO(tx, created.userId),
      inviteUrl: inviteUrlFor(created.token),
      expiresAt: created.expiresAt.toISOString(),
    };
  });
}

// ---- staff reads -----------------------------------------------------------------------

/** GET /students (A, M): scope in SQL (SEC-A2); filters are ANDed with it. */
export async function listStudents(
  actor: Actor,
  query: ListStudentsQuery = {},
  db: DbOrTx = getDb(),
): Promise<StudentListDTO> {
  assertDecision(staffOnly(actor));
  const offset = decodeCursor(query.cursor);
  if (offset < 0) throw errors.validation({ cursor: 'مقدار نامعتبر است' });
  const limit = query.limit ?? DEFAULT_LIMIT;
  const scope = await staffStudentScope(db, actor);
  const search = query.q ? normalizeForSearch(query.q).replace(/^\+/, '') : '';
  const base = {
    scope: scopeCondition(scope, students.userId, students.organizationId),
    stageId: query.stageId,
    runId: query.runId,
    phaseId: query.runId ? query.phaseId : undefined,
    mentorId: query.mentorId,
    // Tags are stored normalised (normalizeFa); compare with the same normalisation.
    tag: query.tag ? normalizeFa(query.tag) || undefined : undefined,
    platformId: query.platformId,
    cohort: query.cohort ? normalizeFa(query.cohort) || undefined : undefined,
    searchPattern: search ? likePattern(search) : undefined,
  };
  const lifecycle = query.lifecycle ?? DEFAULT_LIFECYCLE;
  const [rows, counterRows] = await Promise.all([
    repo.listStudents(
      db,
      { ...base, lifecycle, health: query.health },
      query.sort ?? 'name',
      limit + 1,
      offset,
    ),
    repo.countStudentsByStatus(db, base),
  ]);
  const page = rows.slice(0, limit);
  const primaries = (
    await repo.listProfiles(
      db,
      page.map((r) => r.id),
    )
  ).filter((p) => p.isPrimary);
  const now = new Date();
  const pageIds = page.map((r) => r.id);
  const [stats, courses] = await Promise.all([
    taskStatsForStudents(db, pageIds, now),
    coursePhasesOf(db, actor.organizationId, pageIds, now),
  ]);
  return {
    items: page.map((row) =>
      toListItem(
        row,
        primaries.find((p) => p.studentId === row.id),
        now,
        stats.get(row.id),
        courses.get(row.id),
      ),
    ),
    nextCursor: rows.length > limit ? encodeCursor(offset + limit) : null,
    counts: buildCounts(counterRows, lifecycle, query.health),
  };
}

/** GET /students/tags (A, M): tags in the scope with their counts (sprint-2 gap 1). */
export async function listStudentTags(
  actor: Actor,
  query: StudentTagsQuery = {},
  db: DbOrTx = getDb(),
): Promise<StudentTagsDTO> {
  assertDecision(staffOnly(actor));
  const scope = await staffStudentScope(db, actor);
  const rows = await repo.listTags(
    db,
    scopeCondition(scope, students.userId, students.organizationId),
    query.lifecycle ?? DEFAULT_LIFECYCLE,
  );
  return { tags: rows.map((r) => ({ tag: r.tag, count: r.count })) };
}

/**
 * Internal (today, stuck): list items of the scope with health filters, already sorted by
 * health (red → yellow, then the oldest status). `includeSnoozed: false` hides "Snoozed until".
 */
export async function listStudentItemsByHealth(
  db: DbOrTx,
  actor: Actor,
  filter: {
    health: Array<'green' | 'yellow' | 'red' | 'paused'>;
    mentorId?: string | 'none';
    includeSnoozed?: boolean;
    limit?: number;
  },
  now: Date = new Date(),
): Promise<StudentListItemDTO[]> {
  const scope = await staffStudentScope(db, actor);
  const rows = await repo.listStudents(
    db,
    {
      scope: scopeCondition(scope, students.userId, students.organizationId),
      lifecycle: ['active'],
      mentorId: filter.mentorId,
      health: filter.health,
      hideSnoozedAt: filter.includeSnoozed ? undefined : now,
    },
    'health',
    filter.limit ?? 500,
    0,
  );
  const ids = rows.map((r) => r.id);
  const [profiles, stats, courses] = await Promise.all([
    repo.listProfiles(db, ids),
    taskStatsForStudents(db, ids, now),
    coursePhasesOf(db, actor.organizationId, ids, now),
  ]);
  const primaries = profiles.filter((p) => p.isPrimary);
  return rows.map((row) =>
    toListItem(
      row,
      primaries.find((p) => p.studentId === row.id),
      now,
      stats.get(row.id),
      courses.get(row.id),
    ),
  );
}

/** GET /students/:id (A, M in scope): full record + header. */
export async function getStudent(
  actor: Actor,
  studentId: string,
  db: DbOrTx = getDb(),
): Promise<StaffStudentDTO> {
  await assertStaffStudent(db, actor, studentId);
  return loadStaffStudentDTO(db, studentId);
}

/**
 * GET /students/:id/summary — the panel next to a question (F8). A, M in scope, or a mentor
 * who is the assignee of an open or answered thread of this student (C3, SEC-A8): only
 * while such a thread exists; afterwards the same 404 as a missing student.
 */
export async function getStudentSummary(
  actor: Actor,
  studentId: string,
  db: DbOrTx = getDb(),
): Promise<StudentSummaryDTO> {
  assertDecision(staffOnly(actor));
  try {
    await loadInScope(db, actor, 'student', studentId);
  } catch (err) {
    if (
      !(err instanceof ApiError) ||
      err.code !== 'NOT_FOUND' ||
      !isUuid(studentId) ||
      !(await isAssigneeOfOpenThread(db, actor.userId, studentId))
    ) {
      throw err;
    }
  }
  return loadStudentSummary(db, studentId);
}

/** Internal: the summary panel without access checks (the caller checked access). */
export async function loadStudentSummary(
  db: DbOrTx,
  studentId: string,
): Promise<StudentSummaryDTO> {
  const row = await repo.findStudent(db, studentId);
  if (!row) throw errors.notFound();
  const profiles = await repo.listProfiles(db, [studentId]);
  return {
    id: row.id,
    displayName: row.displayName,
    stage: { id: row.currentStageId, name: row.stageName, displayCode: row.stageDisplayCode },
    daysInStage: daysSince(row.stageEnteredAt),
    profiles: profiles.map(toProfileDTO),
    openTasks: await openTasksOfStudent(db, studentId),
  };
}

// ---- staff writes ----------------------------------------------------------------------

const STAFF_EDITABLE = [
  'messengerHandle',
  'primarySkill',
  'skillLevel',
  'englishWriting',
  'englishSpeaking',
  'hoursPerWeek',
  'incomeGoalUsd',
  'goal90d',
  'priorExperience',
  'selfReportedBlocker',
  'primaryPlatformId',
  'trackId',
  'level',
  'cohort',
  'tags',
  'nicheStatement',
] as const;

const SELF_EDITABLE = [
  'messengerHandle',
  'primarySkill',
  'skillLevel',
  'englishWriting',
  'englishSpeaking',
  'hoursPerWeek',
  'incomeGoalUsd',
  'goal90d',
  'priorExperience',
  'selfReportedBlocker',
  'primaryPlatformId',
] as const;

function catalogRefs(input: { trackId?: string | null; primaryPlatformId?: string | null }) {
  const refs: RefCheck[] = [];
  if (input.trackId)
    refs.push({ field: 'trackId', kind: 'catalog', catalog: 'track', id: input.trackId });
  if (input.primaryPlatformId) {
    refs.push({
      field: 'primaryPlatformId',
      kind: 'catalog',
      catalog: 'platform',
      id: input.primaryPlatformId,
    });
  }
  return refs;
}

/** Applies a PATCH to a locked student row; keeps `search_text` in sync. */
async function applyStudentPatch(
  tx: DbOrTx,
  actor: Actor,
  locked: NonNullable<Awaited<ReturnType<typeof repo.lockStudent>>>,
  values: repo.StudentWriteValues,
  now: Date,
): Promise<void> {
  const fields = Object.keys(values);
  if (fields.length === 0) return;
  if (values.messengerHandle !== undefined || values.tags !== undefined) {
    values.searchText = buildSearchText({
      displayName: locked.displayName,
      phone: locked.erasedAt ? null : locked.phone,
      messengerHandle:
        values.messengerHandle !== undefined ? values.messengerHandle : locked.messengerHandle,
      tags: values.tags ?? locked.tags,
    });
  }
  await repo.updateStudent(tx, locked.id, values, now);
  await recordTimelineEvent(tx, {
    studentId: locked.id,
    type: 'student.updated',
    actorId: actor.userId,
    data: { fields },
    occurredAt: now,
  });
}

/**
 * PATCH /students/:id (A, M in scope). `ifUpdatedAt` → 409 when someone else saved first.
 * `joinedAt` only for admins (migration of existing students).
 */
export async function updateStudent(
  actor: Actor,
  studentId: string,
  input: UpdateStudentInput,
  db: Db = getDb(),
): Promise<StaffStudentDTO> {
  assertDecision(staffOnly(actor));
  if (input.joinedAt !== undefined && actor.role !== 'admin') {
    throw errors.validation({ joinedAt: 'فقط مدیر تاریخ ورود را تغییر می‌دهد.' });
  }
  return db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    const locked = await repo.lockStudent(tx, studentId);
    if (!locked) throw errors.notFound();
    assertNotStale(locked.updatedAt, input.ifUpdatedAt);
    await assertRefs(tx, actor, catalogRefs(input));
    const values: repo.StudentWriteValues = pick(input, STAFF_EDITABLE);
    if (input.joinedAt !== undefined) values.joinedAt = new Date(input.joinedAt);
    await applyStudentPatch(tx, actor, locked, values, new Date());
    return loadStaffStudentDTO(tx, studentId);
  });
}

/**
 * PUT /students/:id/mentor (A). Ends the active primary assignment and starts the new one
 * (`null` = unassigned); the previous mentor loses access immediately (ADR-0004 section 2).
 * Open reminders of the old mentor about this student move in the same transaction.
 */
export async function changeMentor(
  actor: Actor,
  studentId: string,
  input: { mentorId: string | null; reason?: string | null },
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<StaffStudentDTO> {
  assertDecision(staffOnly(actor));
  assertDecision(changeMentorDecision(actor));
  return db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    const locked = await repo.lockStudent(tx, studentId);
    if (!locked) throw errors.notFound();
    if (input.mentorId) {
      await assertRefs(tx, actor, [{ field: 'mentorId', kind: 'staffUser', id: input.mentorId }]);
    }
    if (locked.primaryMentorId === input.mentorId) return loadStaffStudentDTO(tx, studentId);
    const now = new Date();
    await repo.endActivePrimaryAssignment(tx, studentId, now);
    if (input.mentorId) {
      await repo.insertPrimaryAssignment(
        tx,
        {
          studentId,
          mentorId: input.mentorId,
          assignedBy: actor.userId,
          reason: input.reason ?? null,
        },
        now,
      );
    }
    await repo.updateStudent(tx, studentId, { primaryMentorId: input.mentorId }, now);
    // ADR-0004 section 2: the old mentor's open reminders about this student move to the new
    // mentor (or, when the student becomes unassigned, to the admin making the change).
    await transferOpenQuestionsOnMentorChange(
      tx,
      studentId,
      locked.primaryMentorId,
      input.mentorId ?? actor.userId,
      now,
    );
    await transferRemindersOnMentorChange(
      tx,
      studentId,
      locked.primaryMentorId,
      input.mentorId ?? actor.userId,
      now,
    );
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'student.mentor_changed',
      targetType: 'student',
      targetId: studentId,
      data: { fromMentorId: locked.primaryMentorId, toMentorId: input.mentorId },
      ip: meta.ip ?? null,
    });
    await recordTimelineEvent(tx, {
      studentId,
      type: 'mentor.changed',
      actorId: actor.userId,
      data: { from: locked.primaryMentorId, to: input.mentorId },
      occurredAt: now,
    });
    return loadStaffStudentDTO(tx, studentId);
  });
}

/**
 * PUT /students/:id/lifecycle (A, M in scope). `paused` needs `pausedUntil` (a Tehran day
 * after today); other statuses must not send it. Pausing schedules a system reminder for
 * the primary mentor one day before `pausedUntil`; leaving `paused` cancels it. Health is
 * recomputed after the commit; the hourly sweep returns expired pauses to `active`.
 */
export async function setLifecycle(
  actor: Actor,
  studentId: string,
  input: { status: LifecycleStatus; pausedUntil?: string; reason?: string | null },
  db: Db = getDb(),
): Promise<StaffStudentDTO> {
  assertDecision(staffOnly(actor));
  if (input.status === 'paused') {
    if (!input.pausedUntil) throw errors.validation({ pausedUntil: 'تاریخ بازگشت را وارد کن.' });
    if (input.pausedUntil <= tehranDay()) {
      throw errors.validation({ pausedUntil: 'تاریخ بازگشت باید بعد از امروز باشد.' });
    }
  } else if (input.pausedUntil !== undefined) {
    throw errors.validation({ pausedUntil: 'فقط برای «متوقف» لازم است.' });
  }
  await db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    const locked = await repo.lockStudent(tx, studentId);
    if (!locked) throw errors.notFound();
    const now = new Date();
    await repo.updateStudent(
      tx,
      studentId,
      {
        lifecycleStatus: input.status,
        pausedUntil: input.status === 'paused' ? (input.pausedUntil ?? null) : null,
        statusReason: input.reason ?? null,
      },
      now,
    );
    if (input.status === 'paused' && input.pausedUntil) {
      await schedulePauseReturnReminder(
        tx,
        {
          studentId,
          ownerId: locked.primaryMentorId ?? actor.userId,
          pausedUntil: input.pausedUntil,
          createdBy: actor.userId,
        },
        now,
      );
    } else {
      await cancelPauseReturnReminders(tx, studentId, now);
    }
    await recordTimelineEvent(tx, {
      studentId,
      type: 'student.lifecycle_changed',
      actorId: actor.userId,
      data: { from: locked.lifecycleStatus, to: input.status },
      occurredAt: now,
    });
  });
  await recomputeHealthSafe(studentId, db);
  return loadStaffStudentDTO(db, studentId);
}

// ---- the student's own record (/me) ----------------------------------------------------

/** GET /me/student (S): `SelfStudentDTO` (no health, flags, tags, cohort, level). */
export async function getOwnStudent(actor: Actor, db: DbOrTx = getDb()): Promise<SelfStudentDTO> {
  assertDecision(studentOnly(actor));
  const row = await repo.findStudent(db, actor.userId);
  if (!row) throw errors.notFound();
  return toSelfDTO(row);
}

/** PATCH /me/student (S): whitelist only (data-model.md 2-3); the schema rejects the rest. */
export async function updateOwnStudent(
  actor: Actor,
  input: UpdateOwnStudentInput,
  db: Db = getDb(),
): Promise<SelfStudentDTO> {
  assertDecision(studentOnly(actor));
  return db.transaction(async (tx) => {
    const locked = await repo.lockStudent(tx, actor.userId);
    if (!locked) throw errors.notFound();
    assertNotStale(locked.updatedAt, input.ifUpdatedAt);
    await assertRefs(tx, actor, catalogRefs(input));
    await applyStudentPatch(tx, actor, locked, pick(input, SELF_EDITABLE), new Date());
    const row = await repo.findStudent(tx, actor.userId);
    if (!row) throw errors.notFound();
    return toSelfDTO(row);
  });
}

// ---- platform profiles -----------------------------------------------------------------

/**
 * Finds the student a profile belongs to, for this actor: staff via `loadInScope`, the
 * student only for their own profiles. Missing, deleted, other student's → the same 404.
 */
async function profileOwnerFor(db: DbOrTx, actor: Actor, profileId: string): Promise<string> {
  if (actor.role === 'student') {
    const row = isUuid(profileId) ? await repo.findProfile(db, profileId) : null;
    if (!row || row.studentId !== actor.userId) throw errors.notFound();
    return row.studentId;
  }
  return (await loadInScope(db, actor, 'profile', profileId)).studentId;
}

/**
 * Platform facts kept in profile.* timeline events (sprint-3 frontend gap 6), so the
 * timeline can still say "Upwork showcase" after the showcase is deleted. A catalog name,
 * no personal data; erasure clears the data like every other event.
 */
function platformFacts(profile: ProfileDTO) {
  return {
    platformId: profile.platform.id,
    platformName: profile.platform.name,
    kind: profile.kind,
  };
}

async function loadProfileDTO(db: DbOrTx, profileId: string): Promise<ProfileDTO> {
  const row = await repo.findProfile(db, profileId);
  if (!row) throw errors.notFound();
  return toProfileDTO(row);
}

/** GET /students/:id/profiles (A, M in scope). */
export async function listStudentProfiles(
  actor: Actor,
  studentId: string,
  db: DbOrTx = getDb(),
): Promise<ProfileDTO[]> {
  await assertStaffStudent(db, actor, studentId);
  return (await repo.listProfiles(db, [studentId])).map(toProfileDTO);
}

/** GET /me/profiles (S). */
export async function listOwnProfiles(actor: Actor, db: DbOrTx = getDb()): Promise<ProfileDTO[]> {
  assertDecision(studentOnly(actor));
  return (await repo.listProfiles(db, [actor.userId])).map(toProfileDTO);
}

async function createProfileFor(
  tx: DbOrTx,
  actor: Actor,
  studentId: string,
  input: CreateProfileInput,
): Promise<ProfileDTO> {
  await assertRefs(tx, actor, [
    { field: 'platformId', kind: 'catalog', catalog: 'platform', id: input.platformId },
  ]);
  const now = new Date();
  if (input.isPrimary) await repo.clearPrimaryProfiles(tx, studentId, null, now);
  const values = pick(input, [
    'publicUrl',
    'headline',
    'rateAmount',
    'rateCurrency',
    'rateUnit',
    'status',
    'niche',
    'notes',
    'isPrimary',
  ] as const);
  if (values.rateAmount && !values.rateCurrency) values.rateCurrency = 'USD';
  const id = await repo.insertProfile(
    tx,
    {
      ...values,
      studentId,
      platformId: input.platformId,
      kind: input.kind,
      createdBy: actor.userId,
    },
    now,
  );
  await recordTimelineEvent(tx, {
    studentId,
    type: 'profile.added',
    actorId: actor.userId,
    subjectType: 'profile',
    subjectId: id,
    data: { ...platformFacts(await loadProfileDTO(tx, id)), kind: input.kind },
    occurredAt: now,
  });
  return loadProfileDTO(tx, id);
}

/** POST /students/:id/profiles (A, M in scope). */
export async function createStudentProfile(
  actor: Actor,
  studentId: string,
  input: CreateProfileInput,
  db: Db = getDb(),
): Promise<ProfileDTO> {
  assertDecision(staffOnly(actor));
  return db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    if (!(await repo.lockStudent(tx, studentId))) throw errors.notFound();
    return createProfileFor(tx, actor, studentId, input);
  });
}

/** POST /me/profiles (S). */
export async function createOwnProfile(
  actor: Actor,
  input: CreateProfileInput,
  db: Db = getDb(),
): Promise<ProfileDTO> {
  assertDecision(studentOnly(actor));
  return db.transaction(async (tx) => {
    if (!(await repo.lockStudent(tx, actor.userId))) throw errors.notFound();
    return createProfileFor(tx, actor, actor.userId, input);
  });
}

/** PATCH /profiles/:id (A, M in scope; S own). */
export async function updateProfile(
  actor: Actor,
  profileId: string,
  input: UpdateProfileInput,
  db: Db = getDb(),
): Promise<ProfileDTO> {
  return db.transaction(async (tx) => {
    const studentId = await profileOwnerFor(tx, actor, profileId);
    const locked = await repo.lockProfile(tx, profileId);
    if (!locked) throw errors.notFound();
    assertNotStale(locked.updatedAt, input.ifUpdatedAt);
    if (input.platformId) {
      await assertRefs(tx, actor, [
        { field: 'platformId', kind: 'catalog', catalog: 'platform', id: input.platformId },
      ]);
    }
    const values = pick(input, [
      'platformId',
      'kind',
      'publicUrl',
      'headline',
      'rateAmount',
      'rateCurrency',
      'rateUnit',
      'status',
      'niche',
      'notes',
      'isPrimary',
    ] as const);
    const fields = Object.keys(values);
    if (fields.length === 0) return loadProfileDTO(tx, profileId);
    const now = new Date();
    const amount = values.rateAmount !== undefined ? values.rateAmount : locked.rateAmount;
    const currency = values.rateCurrency !== undefined ? values.rateCurrency : locked.rateCurrency;
    if (amount && !currency) values.rateCurrency = 'USD';
    if (values.isPrimary) await repo.clearPrimaryProfiles(tx, studentId, profileId, now);
    await repo.updateProfile(tx, profileId, values, now);
    const updated = await loadProfileDTO(tx, profileId);
    await recordTimelineEvent(tx, {
      studentId,
      type: 'profile.updated',
      actorId: actor.userId,
      subjectType: 'profile',
      subjectId: profileId,
      data: { fields, ...platformFacts(updated) },
      occurredAt: now,
    });
    return updated;
  });
}

/** DELETE /profiles/:id (A, M in scope; S own): soft delete. */
export async function deleteProfile(
  actor: Actor,
  profileId: string,
  db: Db = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const studentId = await profileOwnerFor(tx, actor, profileId);
    if (!(await repo.lockProfile(tx, profileId))) throw errors.notFound();
    const before = await loadProfileDTO(tx, profileId);
    const now = new Date();
    await repo.updateProfile(tx, profileId, { deletedAt: now, isPrimary: false }, now);
    await recordTimelineEvent(tx, {
      studentId,
      type: 'profile.removed',
      actorId: actor.userId,
      subjectType: 'profile',
      subjectId: profileId,
      data: platformFacts(before),
      occurredAt: now,
    });
  });
}

/** POST /profiles/:id/approve (A, M in scope): showcase approved by the mentor. */
export async function approveProfile(
  actor: Actor,
  profileId: string,
  db: Db = getDb(),
): Promise<ProfileDTO> {
  assertDecision(staffOnly(actor));
  return db.transaction(async (tx) => {
    const studentId = await profileOwnerFor(tx, actor, profileId);
    if (!(await repo.lockProfile(tx, profileId))) throw errors.notFound();
    const now = new Date();
    await repo.updateProfile(
      tx,
      profileId,
      { mentorApprovedAt: now, mentorApprovedBy: actor.userId },
      now,
    );
    const approved = await loadProfileDTO(tx, profileId);
    await recordTimelineEvent(tx, {
      studentId,
      type: 'profile.approved',
      actorId: actor.userId,
      subjectType: 'profile',
      subjectId: profileId,
      data: platformFacts(approved),
      occurredAt: now,
    });
    return approved;
  });
}

/** GET /profiles/:id/snapshots (A, M in scope; S own): newest first. */
export async function listProfileSnapshots(
  actor: Actor,
  profileId: string,
  db: DbOrTx = getDb(),
): Promise<ProfileSnapshotDTO[]> {
  await profileOwnerFor(db, actor, profileId);
  return (await repo.listSnapshots(db, profileId)).map(toSnapshotDTO);
}

/** POST /profiles/:id/snapshots (A, M in scope; S own): a manual full-text version. */
export async function createProfileSnapshot(
  actor: Actor,
  profileId: string,
  input: CreateSnapshotInput,
  db: Db = getDb(),
): Promise<ProfileSnapshotDTO> {
  return db.transaction(async (tx) => {
    await profileOwnerFor(tx, actor, profileId);
    if (!(await repo.lockProfile(tx, profileId))) throw errors.notFound();
    const row = await repo.insertSnapshot(
      tx,
      {
        profileId,
        headline: input.headline ?? null,
        bodyText: input.bodyText,
        rateText: input.rateText ?? null,
        createdBy: actor.userId,
      },
      new Date(),
    );
    return toSnapshotDTO(row);
  });
}

// ---- internal helpers for the path module (no actor; callers check access) ------------

/** Row lock + current stage, for a stage change. */
export async function lockStudentForStageChange(tx: DbOrTx, studentId: string) {
  const row = await repo.lockStudent(tx, studentId);
  return row ? { id: row.id, currentStageId: row.currentStageId } : null;
}

/** Writes `current_stage_id` and `stage_entered_at` (only path.service calls this). */
export async function setCurrentStage(
  tx: DbOrTx,
  studentId: string,
  stageId: string,
  now: Date,
): Promise<void> {
  await repo.updateStudent(tx, studentId, { currentStageId: stageId, stageEnteredAt: now }, now);
}

export async function countActiveStudentsInStage(tx: DbOrTx, stageId: string): Promise<number> {
  return repo.countActiveStudentsInStage(tx, stageId);
}

/**
 * Students for the kanban, inside the actor's scope (SQL, SEC-A2). The caller already
 * checked the role. `mentorId` / `tag` filters are ANDed with the scope.
 */
export async function listStudentsForBoard(
  db: DbOrTx,
  actor: Actor,
  filter: {
    mentorId?: string | 'none';
    tag?: string;
    health?: 'green' | 'yellow' | 'red' | 'paused';
  },
) {
  const scope = await staffStudentScope(db, actor);
  const conditions: SQL[] = [
    ...repo.listConditions({
      scope: scopeCondition(scope, students.userId, students.organizationId),
      lifecycle: DEFAULT_LIFECYCLE,
      mentorId: filter.mentorId,
      tag: filter.tag,
    }),
    ...repo.healthConditions({ health: filter.health ? [filter.health] : undefined }),
  ];
  return repo.listForBoard(db, conditions);
}

/**
 * Snapshot written by a task submission (profile_review; data-model.md 2-3): only when the
 * profile still exists and belongs to the task's student. The caller (tasks.service)
 * already checked the actor and takes the profile from the task, never from input (C3).
 */
export async function insertProfileSnapshotFromSubmission(
  tx: DbOrTx,
  input: {
    profileId: string;
    studentId: string;
    bodyText: string;
    createdBy: string;
    sourceSubmissionId: string;
  },
): Promise<boolean> {
  const profile = await repo.findProfile(tx, input.profileId);
  if (!profile || profile.studentId !== input.studentId) return false;
  await repo.insertSnapshot(
    tx,
    {
      profileId: input.profileId,
      headline: profile.headline,
      bodyText: input.bodyText,
      rateText: null,
      createdBy: input.createdBy,
      sourceSubmissionId: input.sourceSubmissionId,
    },
    new Date(),
  );
  return true;
}

/**
 * Internal (CSV export, admin only — the caller checks the role and audits): every student
 * with the columns of `GET /exports/students.csv` (SEC-V3: explicit and minimal; no notes,
 * flags or health).
 */
export async function listStudentsForExport(db: DbOrTx, organizationId: string) {
  const rows = await repo.listStudents(
    db,
    {
      scope: scopeCondition(
        { kind: 'all', organizationId },
        students.primaryMentorId,
        students.organizationId,
      ),
      lifecycle: [...ALL_LIFECYCLES],
    },
    'name',
    100_000,
    0,
  );
  const ids = rows.map((r) => r.id);
  const primaries = (await repo.listProfiles(db, ids)).filter((p) => p.isPrimary);
  const now = new Date();
  const stats = await taskStatsForStudents(db, ids, now);
  return rows.map((row) => {
    const primary = primaries.find((p) => p.studentId === row.id);
    const s = stats.get(row.id) ?? NO_TASKS;
    return {
      id: row.id,
      displayName: row.displayName,
      phone: row.erasedAt ? null : row.phone,
      mentorName: row.mentorDisplayName,
      stageCode: row.stageDisplayCode,
      stageName: row.stageName,
      daysInStage: daysSince(row.stageEnteredAt, now),
      lifecycleStatus: row.lifecycleStatus,
      trackName: row.trackName,
      primaryPlatformName: row.primaryPlatformName,
      primaryProfileUrl: primary?.publicUrl ?? null,
      primaryProfileHeadline: primary?.headline ?? null,
      joinedAt: row.joinedAt,
      lastActivityAt: row.lastActivityAt,
      openTaskCount: s.open,
      overdueTaskCount: s.overdue,
    };
  });
}

const ALL_LIFECYCLES = ['active', 'paused', 'graduated', 'dropped'] as const;
