import { type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import type { DbOrTx } from '@/server/db';
import { errors } from '@/server/http/errors';
import type { AccessSettings } from '../catalog/contracts';
import { getAccessSettings } from '../catalog/service';
import {
  findAttachmentRoot,
  findCheckinRoot,
  findFlagRoot,
  findMilestoneRoot,
  findNoteRoot,
  findPrimaryMentor,
  findProfileRoot,
  findQuestionRoot,
  findReviewRoot,
  findSubmissionRoot,
  findTaskRoot,
} from './repo';

/**
 * access — role + ownership scope (ADR-0004 section 1, security.md SEC-A1/A2).
 *
 *   staffStudentScope(actor):
 *     admin   → ALL
 *     mentor  → settings.access.mentorScope == 'all' ? ALL : students.primary_mentor_id = actor
 *     student → NONE (students never go through staff paths)
 */
export type StaffStudentScope =
  | { kind: 'all' }
  | { kind: 'mentor'; mentorId: string }
  | { kind: 'none' };

/** Pure decision; unit-tested. */
export function resolveStaffStudentScope(actor: Actor, access: AccessSettings): StaffStudentScope {
  switch (actor.role) {
    case 'admin':
      return { kind: 'all' };
    case 'mentor':
      return access.mentorScope === 'all'
        ? { kind: 'all' }
        : { kind: 'mentor', mentorId: actor.userId };
    case 'student':
      return { kind: 'none' };
    default: {
      // Unknown role → nothing. Never fall through to a wider scope.
      const _exhaustive: never = actor.role;
      return { kind: 'none' };
    }
  }
}

export async function staffStudentScope(db: DbOrTx, actor: Actor): Promise<StaffStudentScope> {
  if (actor.role !== 'mentor') return resolveStaffStudentScope(actor, NARROWEST);
  return resolveStaffStudentScope(actor, await getAccessSettings(db));
}

const NARROWEST: AccessSettings = { mentorScope: 'assigned', mentorsCanInviteStudents: false };

/**
 * SQL condition every staff list query ANDs into its WHERE (SEC-A2), given the column that
 * holds the student's primary mentor (`students.primary_mentor_id`, or the same column
 * reached through a join).
 */
export function scopeCondition(
  scope: StaffStudentScope,
  primaryMentorColumn: AnyPgColumn | SQL,
): SQL {
  switch (scope.kind) {
    case 'all':
      return sql`true`;
    case 'mentor':
      return sql`${primaryMentorColumn} = ${scope.mentorId}`;
    case 'none':
      return sql`false`;
  }
}

/** Primary-mentor lookup for one student (null when unassigned or not a student). */
export type PrimaryMentorLookup = (db: DbOrTx, studentId: string) => Promise<string | null>;

export const lookupPrimaryMentorFromStudents: PrimaryMentorLookup = async (db, studentId) =>
  isUuid(studentId) ? ((await findPrimaryMentor(db, studentId))?.primaryMentorId ?? null) : null;

/**
 * Whether `studentId` (an existing student) is inside the actor's staff scope.
 * Callers must already know the student exists (identity checks role = 'student').
 */
export async function isStudentInScope(
  db: DbOrTx,
  actor: Actor,
  studentId: string,
  lookupPrimaryMentor: PrimaryMentorLookup = lookupPrimaryMentorFromStudents,
): Promise<boolean> {
  const scope = await staffStudentScope(db, actor);
  return isInScope(
    scope,
    await lookupPrimaryMentorIfNeeded(scope, db, studentId, lookupPrimaryMentor),
  );
}

async function lookupPrimaryMentorIfNeeded(
  scope: StaffStudentScope,
  db: DbOrTx,
  studentId: string,
  lookup: PrimaryMentorLookup,
): Promise<string | null> {
  return scope.kind === 'mentor' ? lookup(db, studentId) : null;
}

/** Pure check of one student's primary mentor against a scope. */
export function isInScope(scope: StaffStudentScope, primaryMentorId: string | null): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'mentor':
      return primaryMentorId !== null && primaryMentorId === scope.mentorId;
    case 'none':
      return false;
  }
}

// ---- loadInScope -----------------------------------------------------------------------

/**
 * Resource kinds that hang off a student. Each kind gets a resolver that walks from the
 * resource to its root `student_id` (e.g. review → submission → task → student_id).
 */
export type ScopedKind =
  | 'student'
  | 'profile'
  | 'task'
  | 'submission'
  | 'review'
  | 'note'
  | 'question'
  | 'milestone'
  | 'checkin'
  | 'reminder'
  | 'attachment'
  | 'flag';

export type ScopeResolver<T = unknown> = (
  db: DbOrTx,
  id: string,
) => Promise<{ studentId: string; primaryMentorId: string | null; resource: T } | null>;

/**
 * Resolvers per kind. Each walks from the resource to its root `student_id`. Later modules
 * add theirs here (tasks → 'task', 'submission', 'review'; timeline → 'note'; …).
 * A kind without a resolver throws (never "allowed").
 */
export const scopeResolvers: Partial<Record<ScopedKind, ScopeResolver>> = {
  student: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findPrimaryMentor(db, id);
    return row ? { studentId: id, primaryMentorId: row.primaryMentorId, resource: { id } } : null;
  },
  // Soft-deleted profiles do not exist for anyone.
  profile: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findProfileRoot(db, id);
    return row ? { ...row, resource: { id } } : null;
  },
  task: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findTaskRoot(db, id);
    return row ? { ...row, resource: { id } } : null;
  },
  submission: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findSubmissionRoot(db, id);
    return row
      ? {
          studentId: row.studentId,
          primaryMentorId: row.primaryMentorId,
          resource: { id, taskId: row.taskId },
        }
      : null;
  },
  review: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findReviewRoot(db, id);
    return row
      ? {
          studentId: row.studentId,
          primaryMentorId: row.primaryMentorId,
          resource: { id, reviewerId: row.reviewerId },
        }
      : null;
  },
  // Soft-deleted notes do not exist for anyone.
  note: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findNoteRoot(db, id);
    return row
      ? {
          studentId: row.studentId,
          primaryMentorId: row.primaryMentorId,
          resource: { id, authorId: row.authorId },
        }
      : null;
  },
  // Only linked attachments have a student root; pending ones belong to their uploader.
  attachment: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findAttachmentRoot(db, id);
    return row
      ? {
          studentId: row.studentId,
          primaryMentorId: row.primaryMentorId,
          resource: { id, thread: row.thread },
        }
      : null;
  },
  // Scope only. The out-of-scope assignee rule is applied by the questions module.
  question: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findQuestionRoot(db, id);
    return row
      ? {
          studentId: row.studentId,
          primaryMentorId: row.primaryMentorId,
          resource: { id, assigneeId: row.assigneeId, status: row.status },
        }
      : null;
  },
  milestone: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findMilestoneRoot(db, id);
    return row ? { ...row, resource: { id } } : null;
  },
  checkin: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findCheckinRoot(db, id);
    return row ? { ...row, resource: { id } } : null;
  },
  flag: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findFlagRoot(db, id);
    return row ? { ...row, resource: { id } } : null;
  },
};

/**
 * SEC-A1 / C3: the only way a service reads a single student-owned resource for staff.
 * Missing and out-of-scope resources give the same `404 NOT_FOUND`.
 */
export async function loadInScope<T = unknown>(
  db: DbOrTx,
  actor: Actor,
  kind: ScopedKind,
  id: string,
  resolvers: Partial<Record<ScopedKind, ScopeResolver>> = scopeResolvers,
): Promise<{ studentId: string; resource: T }> {
  const resolver = resolvers[kind];
  if (!resolver) throw new Error(`loadInScope: no resolver registered for "${kind}"`);
  // Students never use staff paths (their routes live under /me and scope by session).
  if (actor.role === 'student') throw errors.notFound();
  const found = await resolver(db, id);
  if (!found) throw errors.notFound();
  const scope = await staffStudentScope(db, actor);
  if (!isInScope(scope, found.primaryMentorId)) throw errors.notFound();
  return { studentId: found.studentId, resource: found.resource as T };
}
