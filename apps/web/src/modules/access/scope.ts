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
  findProfileRoot,
  findQuestionRoot,
  findReviewRoot,
  findStudentOrganization,
  findSubmissionRoot,
  findTaskRoot,
} from './repo';

/**
 * access — role + ownership scope (ADR-0004 section 1, security.md SEC-A1/A2).
 *
 *   staffStudentScope(actor):
 *     admin   → ALL (of the actor's organization)
 *     mentor  → settings.access.mentorScope == 'all' ? ALL : the students they work with
 *     student → NONE (students never go through staff paths)
 *
 * "Work with" (sprint 4 of Coach Office, ADR-0012 section 5): an active `enrollment_mentors`
 * row on one of the student's enrollments (primary or secondary; on the legacy run this is
 * `students.primary_mentor_id`, kept in sync by a trigger), or an active `run_staff` row on a
 * run the student is enrolled in and has not dropped out of.
 *
 * ALL and the mentor scope are always limited to the actor's organization (ADR-0011):
 * a student of another organization is out of scope, which every path answers with 404.
 */
export type StaffStudentScope =
  | { kind: 'all'; organizationId: string }
  | { kind: 'mentor'; mentorId: string; organizationId: string }
  | { kind: 'none' };

/** Pure decision; unit-tested. */
export function resolveStaffStudentScope(actor: Actor, access: AccessSettings): StaffStudentScope {
  switch (actor.role) {
    case 'admin':
      return { kind: 'all', organizationId: actor.organizationId };
    case 'mentor':
      return access.mentorScope === 'all'
        ? { kind: 'all', organizationId: actor.organizationId }
        : { kind: 'mentor', mentorId: actor.userId, organizationId: actor.organizationId };
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
  return resolveStaffStudentScope(actor, await getAccessSettings(db, actor.organizationId));
}

const NARROWEST: AccessSettings = { mentorScope: 'assigned', mentorsCanInviteStudents: false };

/**
 * Subquery of the student ids a mentor works with in one organization (see the header).
 * Plain SQL with its own aliases, so it nests inside any query, including queries that read
 * `enrollments` or `run_staff` themselves. Run staff lose a student who dropped out of the
 * run; an explicit mentor assignment holds until it ends, whatever the enrollment status.
 */
export function mentoredStudentIds(mentorId: string, organizationId: string): SQL {
  return sql`(SELECT scope_e.student_id FROM enrollments scope_e
    WHERE scope_e.organization_id = ${organizationId} AND (
      EXISTS (SELECT 1 FROM enrollment_mentors scope_em
        WHERE scope_em.enrollment_id = scope_e.id AND scope_em.user_id = ${mentorId}
          AND scope_em.ended_at IS NULL)
      OR (scope_e.status <> 'dropped' AND EXISTS (SELECT 1 FROM run_staff scope_rs
        WHERE scope_rs.run_id = scope_e.run_id AND scope_rs.user_id = ${mentorId}
          AND scope_rs.ended_at IS NULL))))`;
}

/**
 * SQL condition every staff list query ANDs into its WHERE (SEC-A2), given the columns that
 * hold the student's id and organization (`students.user_id` and `students.organization_id`,
 * or a row's own `student_id` and `organization_id`, which always equals its student's).
 * Also usable as a selected boolean ("is this row's student in my scope?").
 */
export function scopeCondition(
  scope: StaffStudentScope,
  studentIdColumn: AnyPgColumn | SQL,
  organizationColumn: AnyPgColumn | SQL,
): SQL<boolean> {
  switch (scope.kind) {
    case 'all':
      return sql<boolean>`${organizationColumn} = ${scope.organizationId}`;
    case 'mentor':
      return sql<boolean>`(${organizationColumn} = ${scope.organizationId} AND ${studentIdColumn} IN ${mentoredStudentIds(scope.mentorId, scope.organizationId)})`;
    case 'none':
      return sql<boolean>`false`;
  }
}

/** Whether a mentor works with one student of an organization. */
export type MentorLinkCheck = (
  db: DbOrTx,
  mentorId: string,
  organizationId: string,
  studentId: string,
) => Promise<boolean>;

export const mentorWorksWithStudent: MentorLinkCheck = async (
  db,
  mentorId,
  organizationId,
  studentId,
) => {
  const result = await db.execute<{ linked: boolean }>(
    sql`SELECT ${studentId}::uuid IN ${mentoredStudentIds(mentorId, organizationId)} AS linked`,
  );
  return result.rows[0]?.linked === true;
};

/** Organization of one student (null when not a student). */
export type StudentOrganizationLookup = (
  db: DbOrTx,
  studentId: string,
) => Promise<{ organizationId: string } | null>;

export const lookupStudentOrganization: StudentOrganizationLookup = async (db, studentId) =>
  isUuid(studentId) ? findStudentOrganization(db, studentId) : null;

/**
 * Whether `studentId` (an existing student) is inside the actor's staff scope.
 * Callers must already know the student exists (identity checks role = 'student').
 */
export async function isStudentInScope(
  db: DbOrTx,
  actor: Actor,
  studentId: string,
  lookup: StudentOrganizationLookup = lookupStudentOrganization,
  linked: MentorLinkCheck = mentorWorksWithStudent,
): Promise<boolean> {
  const scope = await staffStudentScope(db, actor);
  if (scope.kind === 'none') return false;
  const root = await lookup(db, studentId);
  return root !== null && studentInScope(db, scope, studentId, root.organizationId, linked);
}

/** One student (its id and organization) against a scope. */
export async function studentInScope(
  db: DbOrTx,
  scope: StaffStudentScope,
  studentId: string,
  organizationId: string,
  linked: MentorLinkCheck = mentorWorksWithStudent,
): Promise<boolean> {
  switch (scope.kind) {
    case 'all':
      return organizationId === scope.organizationId;
    case 'mentor':
      return (
        organizationId === scope.organizationId &&
        linked(db, scope.mentorId, scope.organizationId, studentId)
      );
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
) => Promise<{
  studentId: string;
  organizationId: string;
  resource: T;
} | null>;

/**
 * Resolvers per kind. Each walks from the resource to its root `student_id`. Later modules
 * add theirs here (tasks → 'task', 'submission', 'review'; timeline → 'note'; …).
 * A kind without a resolver throws (never "allowed").
 */
export const scopeResolvers: Partial<Record<ScopedKind, ScopeResolver>> = {
  student: async (db, id) => {
    if (!isUuid(id)) return null;
    const row = await findStudentOrganization(db, id);
    return row ? { studentId: id, ...row, resource: { id } } : null;
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
          organizationId: row.organizationId,
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
          organizationId: row.organizationId,
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
          organizationId: row.organizationId,
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
          organizationId: row.organizationId,
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
          organizationId: row.organizationId,
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
  linked: MentorLinkCheck = mentorWorksWithStudent,
): Promise<{ studentId: string; resource: T }> {
  const resolver = resolvers[kind];
  if (!resolver) throw new Error(`loadInScope: no resolver registered for "${kind}"`);
  // Students never use staff paths (their routes live under /me and scope by session).
  if (actor.role === 'student') throw errors.notFound();
  const found = await resolver(db, id);
  if (!found) throw errors.notFound();
  const scope = await staffStudentScope(db, actor);
  if (!(await studentInScope(db, scope, found.studentId, found.organizationId, linked))) {
    throw errors.notFound();
  }
  return { studentId: found.studentId, resource: found.resource as T };
}
