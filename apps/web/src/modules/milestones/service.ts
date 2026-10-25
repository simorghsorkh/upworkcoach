import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { jalaliMonthRange } from '@/lib/jalali';
import { tehranDay } from '@/lib/tehran-day';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { assertRefs, type RefCheck } from '../access/refs';
import { loadInScope } from '../access/scope';
import { milestoneTypes, platforms } from '../catalog/schema';
import { getMilestoneType } from '../catalog/service';
import { attachmentsByParent, linkAttachmentsToMilestone } from '../files/service';
import { recomputeHealthSafe } from '../health/recompute';
import { users } from '../identity/schema';
import { touchStudentActivity } from '../students/activity';
import { students } from '../students/schema';
import { reviews, submissions, tasks } from '../tasks/schema';
import { recordTimelineEvent } from '../timeline/events';
import type {
  CreateMilestoneInput,
  MilestoneDTO,
  NorthStarDTO,
  NorthStarQuery,
  ProposeMilestoneInput,
  RejectMilestoneInput,
  StudentMilestoneDTO,
} from './contracts';
import { median } from './policy';
import { milestones } from './schema';

/**
 * milestones — results and the North Star (PRD F9, api.md section 12, data-model.md 2-10).
 * North Star = approved milestones of a type with `counts_for_north_star` (a flag, never a
 * name). `unique_per_student` types allow one approved milestone per student, checked under
 * the student's row lock.
 */

const proposer = alias(users, 'm_proposer');
const decider = alias(users, 'm_decider');

const columns = {
  id: milestones.id,
  studentId: milestones.studentId,
  typeId: milestones.typeId,
  typeName: milestoneTypes.name,
  countsForNorthStar: milestoneTypes.countsForNorthStar,
  occurredOn: milestones.occurredOn,
  platformId: milestones.platformId,
  platformName: platforms.name,
  amount: milestones.amount,
  currency: milestones.currency,
  evidenceText: milestones.evidenceText,
  status: milestones.status,
  proposedById: milestones.proposedBy,
  proposedByName: proposer.displayName,
  decidedById: milestones.decidedBy,
  decidedByName: decider.displayName,
  decidedAt: milestones.decidedAt,
  rejectionReason: milestones.rejectionReason,
  createdAt: milestones.createdAt,
};

function baseQuery(db: DbOrTx) {
  return db
    .select(columns)
    .from(milestones)
    .innerJoin(milestoneTypes, eq(milestoneTypes.id, milestones.typeId))
    .innerJoin(proposer, eq(proposer.id, milestones.proposedBy))
    .leftJoin(decider, eq(decider.id, milestones.decidedBy))
    .leftJoin(platforms, eq(platforms.id, milestones.platformId));
}

type Row = Awaited<ReturnType<typeof baseQuery>>[number];

const iso = (d: Date | null) => (d ? d.toISOString() : null);

async function filesOf(db: DbOrTx, rows: Row[]) {
  return attachmentsByParent(
    db,
    'milestoneId',
    rows.map((r) => r.id),
  );
}

function toStaffDTO(row: Row, files: Map<string, MilestoneDTO['attachments']>): MilestoneDTO {
  return {
    id: row.id,
    studentId: row.studentId,
    type: { id: row.typeId, name: row.typeName, countsForNorthStar: row.countsForNorthStar },
    occurredOn: row.occurredOn,
    platform:
      row.platformId && row.platformName ? { id: row.platformId, name: row.platformName } : null,
    amount: row.amount,
    currency: row.currency,
    evidenceText: row.evidenceText,
    attachments: files.get(row.id) ?? [],
    status: row.status,
    proposedBy: { id: row.proposedById, displayName: row.proposedByName },
    decidedBy:
      row.decidedById && row.decidedByName
        ? { id: row.decidedById, displayName: row.decidedByName }
        : null,
    decidedAt: iso(row.decidedAt),
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Student view: built from scratch (ADR-0004 section 3). */
function toStudentDTO(
  row: Row,
  files: Map<string, MilestoneDTO['attachments']>,
): StudentMilestoneDTO {
  return {
    id: row.id,
    type: { id: row.typeId, name: row.typeName },
    occurredOn: row.occurredOn,
    platform:
      row.platformId && row.platformName ? { id: row.platformId, name: row.platformName } : null,
    amount: row.amount,
    currency: row.currency,
    evidenceText: row.evidenceText,
    attachments: files.get(row.id) ?? [],
    status: row.status === 'approved' ? 'approved' : 'proposed',
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.status === 'approved' ? iso(row.decidedAt) : null,
  };
}

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

async function loadOne(db: DbOrTx, id: string): Promise<MilestoneDTO> {
  const [row] = await baseQuery(db).where(eq(milestones.id, id));
  if (!row) throw errors.notFound();
  return toStaffDTO(row, await filesOf(db, [row]));
}

// ---- reads -----------------------------------------------------------------------------

/** GET /students/:id/milestones (A, M in scope): every status, newest event first. */
export async function listStudentMilestones(
  actor: Actor,
  studentId: string,
  db: DbOrTx = getDb(),
): Promise<MilestoneDTO[]> {
  assertStaff(actor);
  await loadInScope(db, actor, 'student', studentId);
  const rows = await baseQuery(db)
    .where(eq(milestones.studentId, studentId))
    .orderBy(desc(milestones.occurredOn), desc(milestones.createdAt));
  const files = await filesOf(db, rows);
  return rows.map((r) => toStaffDTO(r, files));
}

/** GET /me/milestones (S): own approved and proposed ones (rejected stay with the staff). */
export async function listOwnMilestones(
  actor: Actor,
  db: DbOrTx = getDb(),
): Promise<StudentMilestoneDTO[]> {
  if (actor.role !== 'student') throw errors.forbidden();
  const rows = await baseQuery(db)
    .where(and(eq(milestones.studentId, actor.userId), ne(milestones.status, 'rejected')))
    .orderBy(desc(milestones.occurredOn), desc(milestones.createdAt));
  const files = await filesOf(db, rows);
  return rows.map((r) => toStudentDTO(r, files));
}

// ---- writes ----------------------------------------------------------------------------

type WriteInput = CreateMilestoneInput | ProposeMilestoneInput;

async function validateWrite(tx: DbOrTx, actor: Actor, input: WriteInput) {
  const refs: RefCheck[] = [
    { field: 'typeId', kind: 'catalog', catalog: 'milestoneType', id: input.typeId },
  ];
  if (input.platformId) {
    refs.push({ field: 'platformId', kind: 'catalog', catalog: 'platform', id: input.platformId });
  }
  await assertRefs(tx, actor, refs);
  if (input.occurredOn > tehranDay()) {
    throw errors.validation({ occurredOn: 'تاریخ نمی‌تواند در آینده باشد.' });
  }
  const type = await getMilestoneType(tx, input.typeId);
  if (!type) throw errors.validation({ typeId: 'مقدار نامعتبر است' });
  return type;
}

/** Row lock of the student, then: another approved milestone of a unique type → 409. */
async function assertUniqueApproval(
  tx: DbOrTx,
  studentId: string,
  type: { id: string; uniquePerStudent: boolean },
  exceptId: string | null,
): Promise<void> {
  await tx.execute(
    sql`SELECT 1 FROM ${students} WHERE ${students.userId} = ${studentId} FOR UPDATE`,
  );
  if (!type.uniquePerStudent) return;
  const conditions = [
    eq(milestones.studentId, studentId),
    eq(milestones.typeId, type.id),
    eq(milestones.status, 'approved'),
  ];
  if (exceptId) conditions.push(ne(milestones.id, exceptId));
  const [row] = await tx
    .select({ id: milestones.id })
    .from(milestones)
    .where(and(...conditions));
  if (row) throw errors.conflict('این نقطه‌ی عطف برای این هنرجو قبلاً تأیید شده است.');
}

async function insertMilestone(
  tx: DbOrTx,
  actor: Actor,
  studentId: string,
  input: WriteInput,
  status: 'proposed' | 'approved',
  now: Date,
): Promise<string> {
  const amount = input.amount ?? null;
  const [row] = await tx
    .insert(milestones)
    .values({
      studentId,
      typeId: input.typeId,
      occurredOn: input.occurredOn,
      platformId: input.platformId ?? null,
      amount,
      currency: amount ? (input.currency ?? 'USD') : (input.currency ?? null),
      evidenceText: input.evidenceText ?? null,
      status,
      proposedBy: actor.userId,
      decidedBy: status === 'approved' ? actor.userId : null,
      decidedAt: status === 'approved' ? now : null,
      createdAt: now,
    })
    .returning({ id: milestones.id });
  if (!row) throw new Error('insertMilestone returned no row');
  await linkAttachmentsToMilestone(tx, actor.userId, input.attachmentIds, row.id);
  await recordTimelineEvent(tx, {
    studentId,
    type: status === 'approved' ? 'milestone.approved' : 'milestone.proposed',
    actorId: actor.userId,
    subjectType: 'milestone',
    subjectId: row.id,
    data: { typeId: input.typeId, occurredOn: input.occurredOn },
    occurredAt: now,
  });
  return row.id;
}

/** POST /students/:id/milestones (A, M in scope): recorded directly as `approved`. */
export async function createStudentMilestone(
  actor: Actor,
  studentId: string,
  input: CreateMilestoneInput,
  db: Db = getDb(),
): Promise<MilestoneDTO> {
  assertStaff(actor);
  const id = await db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    const type = await validateWrite(tx, actor, input);
    await assertUniqueApproval(tx, studentId, type, null);
    return insertMilestone(tx, actor, studentId, input, 'approved', new Date());
  });
  return loadOne(db, id);
}

/**
 * POST /me/milestones (S): a proposal. A type with `requiresEvidence` needs evidence text
 * or an image (422 otherwise). Counts as student activity.
 */
export async function proposeOwnMilestone(
  actor: Actor,
  input: ProposeMilestoneInput,
  db: Db = getDb(),
): Promise<StudentMilestoneDTO> {
  if (actor.role !== 'student') throw errors.forbidden();
  const id = await db.transaction(async (tx) => {
    const type = await validateWrite(tx, actor, input);
    if (type.requiresEvidence && !input.evidenceText && (input.attachmentIds ?? []).length === 0) {
      throw errors.validation({
        evidenceText: 'برای این مورد یک توضیح یا تصویر مدرک لازم است.',
      });
    }
    const now = new Date();
    const created = await insertMilestone(tx, actor, actor.userId, input, 'proposed', now);
    await touchStudentActivity(tx, actor.userId, now);
    return created;
  });
  await recomputeHealthSafe(actor.userId, db);
  const [row] = await baseQuery(db).where(eq(milestones.id, id));
  if (!row) throw errors.notFound();
  return toStudentDTO(row, await filesOf(db, [row]));
}

async function decide(
  actor: Actor,
  milestoneId: string,
  decision: { to: 'approved' } | { to: 'rejected'; reason: string },
  db: Db,
): Promise<MilestoneDTO> {
  assertStaff(actor);
  await db.transaction(async (tx) => {
    const { studentId } = await loadInScope(tx, actor, 'milestone', milestoneId);
    const [current] = await tx
      .select({ status: milestones.status, typeId: milestones.typeId })
      .from(milestones)
      .where(eq(milestones.id, milestoneId))
      .for('update');
    if (!current) throw errors.notFound();
    if (current.status !== 'proposed') {
      throw errors.conflict(
        current.status === 'approved'
          ? 'این مورد قبلاً تأیید شده است.'
          : 'این مورد قبلاً رد شده است.',
      );
    }
    const now = new Date();
    if (decision.to === 'approved') {
      const type = await getMilestoneType(tx, current.typeId);
      if (!type) throw errors.notFound();
      await assertUniqueApproval(tx, studentId, type, milestoneId);
    }
    await tx
      .update(milestones)
      .set({
        status: decision.to,
        decidedBy: actor.userId,
        decidedAt: now,
        rejectionReason: decision.to === 'rejected' ? decision.reason : null,
      })
      .where(eq(milestones.id, milestoneId));
    await recordTimelineEvent(tx, {
      studentId,
      type: decision.to === 'approved' ? 'milestone.approved' : 'milestone.rejected',
      actorId: actor.userId,
      subjectType: 'milestone',
      subjectId: milestoneId,
      data: { typeId: current.typeId },
      occurredAt: now,
    });
  });
  return loadOne(db, milestoneId);
}

/** POST /milestones/:id/approve (A, M in scope): a second approval of a unique type → 409. */
export async function approveMilestone(
  actor: Actor,
  milestoneId: string,
  db: Db = getDb(),
): Promise<MilestoneDTO> {
  return decide(actor, milestoneId, { to: 'approved' }, db);
}

/** POST /milestones/:id/reject (A, M in scope): only `proposed` ones. */
export async function rejectMilestone(
  actor: Actor,
  milestoneId: string,
  input: RejectMilestoneInput,
  db: Db = getDb(),
): Promise<MilestoneDTO> {
  return decide(actor, milestoneId, { to: 'rejected', reason: input.reason }, db);
}

// ---- North Star (F9) -------------------------------------------------------------------

/** GET /dashboard/north-star (A). */
export async function getNorthStar(
  actor: Actor,
  query: NorthStarQuery = {},
  db: DbOrTx = getDb(),
): Promise<NorthStarDTO> {
  if (actor.role !== 'admin') throw errors.forbidden();
  const month = jalaliMonthRange(tehranDay());
  const from = query.from ?? month.from;
  const to = query.to ?? month.to;
  if (from > to) throw errors.validation({ to: 'پایان بازه نباید قبل از شروع باشد.' });
  const ns = and(eq(milestones.status, 'approved'), eq(milestoneTypes.countsForNorthStar, true));
  const [[inRange], [total], firsts, [labeled], [pending]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(milestones)
      .innerJoin(milestoneTypes, eq(milestoneTypes.id, milestones.typeId))
      .where(and(ns, gte(milestones.occurredOn, from), lte(milestones.occurredOn, to))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(milestones)
      .innerJoin(milestoneTypes, eq(milestoneTypes.id, milestones.typeId))
      .where(ns),
    // First approved North Star milestone of each student − joined day (Tehran), in days.
    db
      .select({
        days: sql<number>`(min(${milestones.occurredOn}) - (${students.joinedAt} AT TIME ZONE 'Asia/Tehran')::date)::int`,
      })
      .from(milestones)
      .innerJoin(milestoneTypes, eq(milestoneTypes.id, milestones.typeId))
      .innerJoin(students, eq(students.userId, milestones.studentId))
      .where(ns)
      .groupBy(milestones.studentId, students.joinedAt),
    // G4: consented proposal_review submissions with a mentor review.
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(submissions)
      .innerJoin(tasks, eq(tasks.id, submissions.taskId))
      .innerJoin(reviews, eq(reviews.submissionId, submissions.id))
      .where(and(eq(tasks.submissionType, 'proposal_review'), eq(submissions.aiUseConsent, true))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(milestones)
      .where(eq(milestones.status, 'proposed')),
  ]);
  const days = firsts.map((f) => Math.max(0, Number(f.days)));
  return {
    from,
    to,
    approvedInRange: inRange?.n ?? 0,
    approvedTotal: total?.n ?? 0,
    medianDaysToFirst: median(days),
    studentsWithFirst: days.length,
    labeledProposalCount: labeled?.n ?? 0,
    pendingProposals: pending?.n ?? 0,
  };
}

// ---- internal ----------------------------------------------------------------------------

/** CSV export (admin; the caller checks the role and audits). No evidence text (SEC-V3). */
export async function listMilestonesForExport(db: DbOrTx) {
  const studentUsers = alias(users, 'm_student');
  return db
    .select({
      studentName: studentUsers.displayName,
      typeName: milestoneTypes.name,
      countsForNorthStar: milestoneTypes.countsForNorthStar,
      occurredOn: milestones.occurredOn,
      platformName: platforms.name,
      amount: milestones.amount,
      currency: milestones.currency,
      status: milestones.status,
      decidedAt: milestones.decidedAt,
      createdAt: milestones.createdAt,
    })
    .from(milestones)
    .innerJoin(milestoneTypes, eq(milestoneTypes.id, milestones.typeId))
    .innerJoin(studentUsers, eq(studentUsers.id, milestones.studentId))
    .leftJoin(platforms, eq(platforms.id, milestones.platformId))
    .orderBy(asc(milestones.occurredOn), asc(milestones.createdAt));
}

/** Pending proposals in a scope («منتظر ما» could show them; used by today counts). */
export async function countPendingProposals(db: DbOrTx, studentIds: readonly string[]) {
  if (studentIds.length === 0) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(milestones)
    .where(and(eq(milestones.status, 'proposed'), inArray(milestones.studentId, [...studentIds])));
  return row?.n ?? 0;
}
