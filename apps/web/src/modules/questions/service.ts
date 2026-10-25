import { eq, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { type BusinessHoursConfig, slaState } from '@/lib/business-hours';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { decodeCursor, encodeCursor } from '@/server/http/schemas';
import { assertRefs, type RefCheck } from '../access/refs';
import { findQuestionRoot } from '../access/repo';
import { isInScope, scopeCondition, staffStudentScope } from '../access/scope';
import { recordAudit } from '../admin/service';
import type { SlaSettings } from '../catalog/contracts';
import {
  type AuditMeta,
  getBusinessHours,
  getQuestionsSettings,
  getSlaSettings,
} from '../catalog/service';
import { attachmentsByParent, linkAttachmentsToQuestionMessage } from '../files/service';
import { recomputeHealthSafe } from '../health/recompute';
import { isActiveStaffUser } from '../identity/service';
import { touchStudentActivity } from '../students/activity';
import { students } from '../students/schema';
import { loadStudentSummary } from '../students/service';
import { recordTimelineEvent } from '../timeline/events';
import type {
  ChangeAssigneeInput,
  CreateQuestionInput,
  ListQuestionsQuery,
  MyQuestionsQuery,
  PostMessageInput,
  QuestionSlaDTO,
  StaffQuestionDetailDTO,
  StaffQuestionListDTO,
  StaffQuestionListItemDTO,
  StudentQuestionDetailDTO,
  StudentQuestionDTO,
  StudentQuestionListDTO,
} from './contracts';
import * as repo from './repo';
import { questionThreads } from './schema';

/**
 * questions — question threads (PRD F8, api.md section 10, ADR-0004).
 *
 * Staff see threads of their scope, plus threads assigned to them outside the scope while
 * those are open or answered («فقط همان رشته» — and the record summary next to it, nothing
 * else). Students only their own threads, through `/me` and the shared `/questions/:id`
 * routes whose DTO is chosen by a `switch` on the role with an error default (SEC-A5).
 *
 * Transitions (data-model.md 2-8): student message → open / awaiting team (SLA starts if not
 * running); team message → answered / awaiting student (SLA stops); close → closed / none;
 * a student message on a closed thread reopens it.
 */

const DEFAULT_LIMIT = 50;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

type SlaContext = { sla: SlaSettings; hours: BusinessHoursConfig; now: Date };

async function slaContext(db: DbOrTx, now = new Date()): Promise<SlaContext> {
  const [sla, hours] = await Promise.all([getSlaSettings(db), getBusinessHours(db)]);
  return { sla, hours: hours as BusinessHoursConfig, now };
}

/** SLA of a thread while the ball is with the team (urgent = shorter threshold). */
export function questionSla(
  row: { awaiting: string; awaitingTeamSince: Date | null; priority: string },
  ctx: SlaContext,
): QuestionSlaDTO | null {
  if (row.awaiting !== 'team' || !row.awaitingTeamSince) return null;
  const slaHours = row.priority === 'urgent' ? ctx.sla.urgentQuestionHours : ctx.sla.questionHours;
  const state = slaState(row.awaitingTeamSince, ctx.now, slaHours, ctx.sla.clock, ctx.hours);
  return { slaHours, ...state };
}

function toStaffItem(
  row: repo.ThreadRow,
  ctx: SlaContext,
  viaAssignment: boolean,
): StaffQuestionListItemDTO {
  const sla = questionSla(row, ctx);
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    awaiting: row.awaiting,
    priority: row.priority,
    source: row.source,
    student: { id: row.studentId, displayName: row.studentDisplayName },
    assignee: { id: row.assigneeId, displayName: row.assigneeDisplayName },
    task: row.taskId && row.taskTitle ? { id: row.taskId, title: row.taskTitle } : null,
    messageCount: row.messageCount,
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: iso(row.lastMessageAt),
    awaitingTeamSince: iso(row.awaitingTeamSince),
    firstResponseAt: iso(row.firstResponseAt),
    sla,
    slaRemainingHours: sla ? sla.remainingHours : null,
    viaAssignment,
  };
}

/** Student view: built from scratch (ADR-0004 section 3). */
function toStudentItem(row: repo.ThreadRow): StudentQuestionDTO {
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    awaiting: row.awaiting,
    priority: row.priority,
    task: row.taskId && row.taskTitle ? { id: row.taskId, title: row.taskTitle } : null,
    messageCount: row.messageCount,
    hasNewReply: row.awaiting === 'student',
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: iso(row.lastMessageAt),
  };
}

// ---- access ---------------------------------------------------------------------------

type StaffAccess = { studentId: string; viaAssignment: boolean };

/**
 * Staff access to one thread: inside the scope, or its assignee while open/answered.
 * Missing, out of scope and closed-for-the-assignee all give the same 404.
 */
async function staffThreadAccess(db: DbOrTx, actor: Actor, threadId: string): Promise<StaffAccess> {
  assertStaff(actor);
  if (!isUuid(threadId)) throw errors.notFound();
  const root = await findQuestionRoot(db, threadId);
  if (!root) throw errors.notFound();
  const scope = await staffStudentScope(db, actor);
  if (isInScope(scope, root.primaryMentorId)) {
    return { studentId: root.studentId, viaAssignment: false };
  }
  if (root.assigneeId === actor.userId && root.status !== 'closed') {
    return { studentId: root.studentId, viaAssignment: true };
  }
  throw errors.notFound();
}

/** The student's own thread; anything else → 404. */
async function ownThread(db: DbOrTx, actor: Actor, threadId: string): Promise<void> {
  if (!isUuid(threadId)) throw errors.notFound();
  const root = await findQuestionRoot(db, threadId);
  if (!root || root.studentId !== actor.userId) throw errors.notFound();
}

// ---- staff reads ----------------------------------------------------------------------

/** GET /questions (A, M): scope OR assigned to me (open/answered); filters ANDed. */
export async function listQuestions(
  actor: Actor,
  query: ListQuestionsQuery = {},
  db: DbOrTx = getDb(),
): Promise<StaffQuestionListDTO> {
  assertStaff(actor);
  const offset = decodeCursor(query.cursor);
  if (offset < 0) throw errors.validation({ cursor: 'مقدار نامعتبر است' });
  const limit = query.limit ?? DEFAULT_LIMIT;
  const scope = await staffStudentScope(db, actor);
  const conditions = [
    repo.staffVisibility(scopeCondition(scope, students.primaryMentorId), actor.userId),
  ];
  if (query.status) conditions.push(eqText(questionThreads.status, query.status));
  if (query.awaiting) conditions.push(eqText(questionThreads.awaiting, query.awaiting));
  if (query.studentId) conditions.push(eqText(questionThreads.studentId, query.studentId));
  if (query.assigneeId && actor.role === 'admin') {
    conditions.push(eqText(questionThreads.assigneeId, query.assigneeId));
  }
  const [rows, ctx] = await Promise.all([
    repo.listThreads(db, conditions, limit + 1, offset),
    slaContext(db),
  ]);
  return {
    items: rows
      .slice(0, limit)
      .map((r) => toStaffItem(r, ctx, !isInScope(scope, r.primaryMentorId))),
    nextCursor: rows.length > limit ? encodeCursor(offset + limit) : null,
  };
}

function eqText(column: AnyPgColumn, value: string): SQL {
  return eq(column, value);
}

/**
 * Internal («امروز»): threads awaiting the team inside the actor's view, most urgent first.
 * Admin with `assigneeId`: only that person's threads.
 */
export async function unansweredQuestionsFor(
  db: DbOrTx,
  actor: Actor,
  assigneeId: string | undefined,
  now: Date,
): Promise<StaffQuestionListItemDTO[]> {
  const scope = await staffStudentScope(db, actor);
  const conditions = [
    repo.staffVisibility(scopeCondition(scope, students.primaryMentorId), actor.userId),
    eqText(questionThreads.awaiting, 'team'),
  ];
  if (assigneeId && actor.role === 'admin') {
    conditions.push(eqText(questionThreads.assigneeId, assigneeId));
  }
  const [rows, ctx] = await Promise.all([
    repo.listThreads(db, conditions, 200, 0),
    slaContext(db, now),
  ]);
  return rows
    .map((r) => toStaffItem(r, ctx, !isInScope(scope, r.primaryMentorId)))
    .sort((a, b) => urgency(a) - urgency(b));
}

/** Breached first, then the least time left. */
function urgency(item: StaffQuestionListItemDTO): number {
  const sla = item.sla;
  if (!sla) return Number.POSITIVE_INFINITY;
  return sla.breached ? -1_000_000 + sla.remainingHours : sla.remainingHours;
}

async function staffDetail(
  db: DbOrTx,
  threadId: string,
  access: StaffAccess,
): Promise<StaffQuestionDetailDTO> {
  const row = await repo.findThread(db, threadId);
  if (!row) throw errors.notFound();
  const [messages, ctx, summary] = await Promise.all([
    repo.listMessages(db, threadId),
    slaContext(db),
    loadStudentSummary(db, access.studentId),
  ]);
  const files = await attachmentsByParent(
    db,
    'questionMessageId',
    messages.map((m) => m.id),
  );
  return {
    ...toStaffItem(row, ctx, access.viaAssignment),
    messages: messages.map((m) => ({
      id: m.id,
      author: { id: m.authorId, displayName: m.authorDisplayName, role: m.authorRole },
      body: m.body,
      links: m.links.map((l) => ({ url: l.url, label: l.label })),
      attachments: files.get(m.id) ?? [],
      cannedResponseId: m.cannedResponseId,
      createdAt: m.createdAt.toISOString(),
      editedAt: iso(m.editedAt),
    })),
    studentSummary: summary,
    closedAt: iso(row.closedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function studentDetail(
  db: DbOrTx,
  actor: Actor,
  threadId: string,
): Promise<StudentQuestionDetailDTO> {
  const row = await repo.findThread(db, threadId);
  if (!row || row.studentId !== actor.userId) throw errors.notFound();
  const [messages, settings] = await Promise.all([
    repo.listMessages(db, threadId),
    getQuestionsSettings(db),
  ]);
  const files = await attachmentsByParent(
    db,
    'questionMessageId',
    messages.map((m) => m.id),
  );
  return {
    ...toStudentItem(row),
    messages: messages.map((m) => ({
      id: m.id,
      author: {
        displayName: m.authorDisplayName,
        isMe: m.authorId === actor.userId,
        isTeam: m.authorRole !== 'student',
      },
      body: m.body,
      links: m.links.map((l) => ({ url: l.url, label: l.label })),
      attachments: files.get(m.id) ?? [],
      createdAt: m.createdAt.toISOString(),
    })),
    expectedResponseText: settings.expectedResponseText,
  };
}

/** GET /questions/:id: staff DTO (scope or assignee) or the student's own DTO (SEC-A5). */
export async function getQuestion(
  actor: Actor,
  threadId: string,
  db: DbOrTx = getDb(),
): Promise<StaffQuestionDetailDTO | StudentQuestionDetailDTO> {
  switch (actor.role) {
    case 'admin':
    case 'mentor':
      return staffDetail(db, threadId, await staffThreadAccess(db, actor, threadId));
    case 'student':
      await ownThread(db, actor, threadId);
      return studentDetail(db, actor, threadId);
    default:
      throw errors.forbidden();
  }
}

/** RSC helper for staff pages. */
export async function getStaffQuestion(
  actor: Actor,
  threadId: string,
  db: DbOrTx = getDb(),
): Promise<StaffQuestionDetailDTO> {
  return staffDetail(db, threadId, await staffThreadAccess(db, actor, threadId));
}

/** RSC helper for student pages. */
export async function getOwnQuestion(
  actor: Actor,
  threadId: string,
  db: DbOrTx = getDb(),
): Promise<StudentQuestionDetailDTO> {
  if (actor.role !== 'student') throw errors.forbidden();
  await ownThread(db, actor, threadId);
  return studentDetail(db, actor, threadId);
}

// ---- student --------------------------------------------------------------------------

/** GET /me/questions (S): newest activity first, with the expected response time. */
export async function listOwnQuestions(
  actor: Actor,
  query: MyQuestionsQuery = {},
  db: DbOrTx = getDb(),
): Promise<StudentQuestionListDTO> {
  if (actor.role !== 'student') throw errors.forbidden();
  const [rows, settings] = await Promise.all([
    repo.listThreadsOfStudent(db, actor.userId, query.status),
    getQuestionsSettings(db),
  ]);
  return { items: rows.map(toStudentItem), expectedResponseText: settings.expectedResponseText };
}

/** Assignee of a new thread: the active primary mentor, otherwise the first active admin. */
async function defaultAssignee(tx: DbOrTx, studentId: string): Promise<string> {
  const [row] = await tx
    .select({ mentorId: students.primaryMentorId })
    .from(students)
    .where(eq(students.userId, studentId));
  if (row?.mentorId && (await isActiveStaffUser(tx, row.mentorId))) return row.mentorId;
  const admin = await repo.firstActiveAdmin(tx);
  if (!admin) throw errors.conflict('فعلاً کسی برای پاسخ نیست؛ بعداً دوباره امتحان کن.');
  return admin;
}

/**
 * Internal: creates a thread with its first message for `studentId`, inside the caller's
 * transaction (POST /me/questions, check-in «needs help»). The caller checks access.
 */
export async function createThreadForStudent(
  tx: DbOrTx,
  actor: Actor,
  studentId: string,
  input: CreateQuestionInput & { source?: 'student' | 'checkin' },
  now: Date,
): Promise<string> {
  const refs: RefCheck[] = [];
  if (input.taskId)
    refs.push({ field: 'taskId', kind: 'taskOfStudent', id: input.taskId, studentId });
  await assertRefs(tx, actor, refs);
  const threadId = await repo.insertThread(
    tx,
    {
      studentId,
      subject: input.subject,
      assigneeId: await defaultAssignee(tx, studentId),
      taskId: input.taskId ?? null,
      priority: input.priority ?? 'normal',
      source: input.source ?? 'student',
    },
    now,
  );
  const messageId = await repo.insertMessage(
    tx,
    {
      threadId,
      authorId: actor.userId,
      body: input.body,
      links: (input.links ?? []).map((l) => ({ url: l.url, label: l.label ?? null })),
      cannedResponseId: null,
    },
    now,
  );
  await linkAttachmentsToQuestionMessage(tx, actor.userId, input.attachmentIds, messageId);
  await recordTimelineEvent(tx, {
    studentId,
    type: 'question.created',
    actorId: actor.userId,
    subjectType: 'question',
    subjectId: threadId,
    data: {
      priority: input.priority ?? 'normal',
      source: input.source ?? 'student',
      taskId: input.taskId ?? null,
    },
    occurredAt: now,
  });
  await touchStudentActivity(tx, studentId, now);
  return threadId;
}

/** POST /me/questions (S) → 201 StudentQuestionDetailDTO. */
export async function createOwnQuestion(
  actor: Actor,
  input: CreateQuestionInput,
  db: Db = getDb(),
): Promise<StudentQuestionDetailDTO> {
  if (actor.role !== 'student') throw errors.forbidden();
  const threadId = await db.transaction((tx) =>
    createThreadForStudent(tx, actor, actor.userId, input, new Date()),
  );
  await recomputeHealthSafe(actor.userId, db);
  return studentDetail(db, actor, threadId);
}

// ---- messages and transitions ---------------------------------------------------------

/**
 * POST /questions/:id/messages (A, M: scope or assignee; S: own). Staff on a closed thread
 * → 409 (the student reopens it with a new message). `cannedResponseId` is staff-only.
 */
export async function postMessage(
  actor: Actor,
  threadId: string,
  input: PostMessageInput,
  db: Db = getDb(),
): Promise<StaffQuestionDetailDTO | StudentQuestionDetailDTO> {
  const student = actor.role === 'student';
  if (!student) assertStaff(actor);
  if (student && input.cannedResponseId) {
    throw errors.validation({ cannedResponseId: 'مقدار نامعتبر است' });
  }
  const held: { access?: StaffAccess } = {};
  await db.transaction(async (tx) => {
    if (student) await ownThread(tx, actor, threadId);
    else held.access = await staffThreadAccess(tx, actor, threadId);
    const locked = await repo.lockThread(tx, threadId);
    if (!locked) throw errors.notFound();
    if (!student && locked.status === 'closed') {
      throw errors.conflict('این سؤال بسته شده است.');
    }
    if (input.cannedResponseId) {
      await assertRefs(tx, actor, [
        {
          field: 'cannedResponseId',
          kind: 'catalog',
          catalog: 'cannedResponse',
          id: input.cannedResponseId,
        },
      ]);
    }
    const now = new Date();
    const messageId = await repo.insertMessage(
      tx,
      {
        threadId,
        authorId: actor.userId,
        body: input.body,
        links: (input.links ?? []).map((l) => ({ url: l.url, label: l.label ?? null })),
        cannedResponseId: input.cannedResponseId ?? null,
      },
      now,
    );
    await linkAttachmentsToQuestionMessage(tx, actor.userId, input.attachmentIds, messageId);
    if (student) {
      await repo.updateThread(
        tx,
        threadId,
        {
          status: 'open',
          awaiting: 'team',
          awaitingTeamSince: locked.awaitingTeamSince ?? now,
          lastMessageAt: now,
          closedAt: null,
          closedBy: null,
        },
        now,
      );
      await touchStudentActivity(tx, actor.userId, now);
    } else {
      await repo.updateThread(
        tx,
        threadId,
        {
          status: 'answered',
          awaiting: 'student',
          awaitingTeamSince: null,
          lastMessageAt: now,
          ...(locked.firstResponseAt ? {} : { firstResponseAt: now }),
        },
        now,
      );
      await recordTimelineEvent(tx, {
        studentId: locked.studentId,
        type: 'question.answered',
        actorId: actor.userId,
        subjectType: 'question',
        subjectId: threadId,
        data: { first: locked.firstResponseAt === null },
        occurredAt: now,
      });
    }
  });
  if (student) {
    await recomputeHealthSafe(actor.userId, db);
    return studentDetail(db, actor, threadId);
  }
  return staffDetail(db, threadId, held.access ?? (await staffThreadAccess(db, actor, threadId)));
}

/** POST /questions/:id/close (A, M: scope or assignee; S: own). Closing twice is a no-op. */
export async function closeQuestion(
  actor: Actor,
  threadId: string,
  db: Db = getDb(),
): Promise<StaffQuestionDetailDTO | StudentQuestionDetailDTO> {
  const student = actor.role === 'student';
  if (!student) assertStaff(actor);
  const held: { access?: StaffAccess } = {};
  await db.transaction(async (tx) => {
    if (student) await ownThread(tx, actor, threadId);
    else held.access = await staffThreadAccess(tx, actor, threadId);
    const locked = await repo.lockThread(tx, threadId);
    if (!locked) throw errors.notFound();
    if (locked.status === 'closed') return;
    const now = new Date();
    await repo.updateThread(
      tx,
      threadId,
      {
        status: 'closed',
        awaiting: 'none',
        awaitingTeamSince: null,
        closedAt: now,
        closedBy: actor.userId,
      },
      now,
    );
    await recordTimelineEvent(tx, {
      studentId: locked.studentId,
      type: 'question.closed',
      actorId: actor.userId,
      subjectType: 'question',
      subjectId: threadId,
      data: { by: actor.role },
      occurredAt: now,
    });
  });
  if (student) return studentDetail(db, actor, threadId);
  const access = held.access;
  if (!access) throw errors.notFound();
  // Built right after closing with the access checked before it; the out-of-scope assignee
  // gets 404 on any later read of this thread (ADR-0004).
  return staffDetail(db, threadId, access);
}

/** PUT /questions/:id/assignee (A): an active admin or mentor (C3, else 422). Audited. */
export async function changeAssignee(
  actor: Actor,
  threadId: string,
  input: ChangeAssigneeInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<StaffQuestionDetailDTO> {
  if (actor.role !== 'admin') throw errors.forbidden();
  const access = await db.transaction(async (tx) => {
    const found = await staffThreadAccess(tx, actor, threadId);
    const locked = await repo.lockThread(tx, threadId);
    if (!locked) throw errors.notFound();
    await assertRefs(tx, actor, [{ field: 'assigneeId', kind: 'staffUser', id: input.assigneeId }]);
    if (locked.assigneeId !== input.assigneeId) {
      const now = new Date();
      await repo.updateThread(tx, threadId, { assigneeId: input.assigneeId }, now);
      await recordAudit(tx, {
        actorId: actor.userId,
        action: 'question.assignee_changed',
        targetType: 'question',
        targetId: threadId,
        data: { fromAssigneeId: locked.assigneeId, toAssigneeId: input.assigneeId },
        ip: meta.ip ?? null,
      });
    }
    return found;
  });
  return staffDetail(db, threadId, access);
}
