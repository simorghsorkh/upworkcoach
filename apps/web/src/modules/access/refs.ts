import type { Actor } from '@/server/auth/current-user';
import type { DbOrTx } from '@/server/db';
import { errors, INVALID_REF_MESSAGE } from '@/server/http/errors';
import { type CatalogRefKind, isActiveCatalogRef } from '../catalog/service';
import { isActiveStaffUser } from '../identity/service';
import { findPrimaryMentor, isProfileOfStudent, isTaskOfStudent } from './repo';
import { isStudentInScope, type PrimaryMentorLookup } from './scope';

/**
 * Reference-id rule (ADR-0004 section 1-1, security.md C3 / SEC-A3).
 *
 * Every id in the BODY or QUERY of a write request that points to another resource is
 * checked like the main resource, inside the same write transaction and before any write.
 * Any failure → `422 VALIDATION_FAILED` with `fields.<name> = "مقدار نامعتبر است"` — one
 * message for missing, out of scope, other student's and inactive, so nothing leaks.
 * (`404` is only for the path id.)
 *
 * Every new reference id in the API needs a row in the ADR table and a `RefCheck` kind here.
 */
export type RefCheck =
  /** mentorId, reviewerId, assigneeId, ownerId: an active admin or mentor. */
  | { field: string; kind: 'staffUser'; id: string; mentorActorMustBeSelf?: boolean }
  /** studentId / studentIds: all inside staffStudentScope(actor); one bad id rejects all. */
  | { field: string; kind: 'studentsInScope'; ids: readonly string[] }
  /**
   * stageId, toStageId, platformId, primaryPlatformId, trackId, templateId, typeId,
   * cannedResponseId: exists and is active.
   */
  | { field: string; kind: 'catalog'; catalog: CatalogRefKind; id: string }
  /** profileId (e.g. on a task): belongs to `studentId` and is not deleted. */
  | { field: string; kind: 'profileOfStudent'; id: string; studentId: string }
  /** taskId (on a question): a task of the same student. */
  | { field: string; kind: 'taskOfStudent'; id: string; studentId: string }
  /**
   * attachmentIds are NOT checked here: the files module links them with one atomic
   * UPDATE … WHERE status = 'pending' AND uploaded_by = actor (C4), which is the check.
   */
  | { field: string; kind: 'todo'; reason: string };

export type RefDeps = {
  isActiveStaffUser: (db: DbOrTx, id: string) => Promise<boolean>;
  /** Must also confirm that the id is an existing student. */
  isExistingStudent: (db: DbOrTx, id: string) => Promise<boolean>;
  lookupPrimaryMentor?: PrimaryMentorLookup;
  isActiveCatalogRef: (db: DbOrTx, kind: CatalogRefKind, id: string) => Promise<boolean>;
  isProfileOfStudent: (db: DbOrTx, profileId: string, studentId: string) => Promise<boolean>;
  isTaskOfStudent: (db: DbOrTx, taskId: string, studentId: string) => Promise<boolean>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const defaultRefDeps: RefDeps = {
  isActiveStaffUser,
  isExistingStudent: async (db, id) =>
    UUID_RE.test(id) && (await findPrimaryMentor(db, id)) !== null,
  isActiveCatalogRef,
  isProfileOfStudent: async (db, profileId, studentId) =>
    UUID_RE.test(profileId) &&
    UUID_RE.test(studentId) &&
    isProfileOfStudent(db, profileId, studentId),
  isTaskOfStudent: async (db, taskId, studentId) =>
    UUID_RE.test(taskId) && UUID_RE.test(studentId) && isTaskOfStudent(db, taskId, studentId),
};

export async function assertRefs(
  db: DbOrTx,
  actor: Actor,
  refs: readonly RefCheck[],
  deps: Partial<RefDeps> = {},
): Promise<void> {
  const resolved: RefDeps = { ...defaultRefDeps, ...deps };
  const fields: Record<string, string> = {};
  for (const ref of refs) {
    if (fields[ref.field]) continue;
    if (!(await checkRef(db, actor, ref, resolved))) fields[ref.field] = INVALID_REF_MESSAGE;
  }
  if (Object.keys(fields).length > 0) throw errors.validation(fields);
}

async function checkRef(db: DbOrTx, actor: Actor, ref: RefCheck, deps: RefDeps): Promise<boolean> {
  switch (ref.kind) {
    case 'staffUser':
      if (ref.mentorActorMustBeSelf && actor.role === 'mentor' && ref.id !== actor.userId) {
        return false;
      }
      return deps.isActiveStaffUser(db, ref.id);
    case 'studentsInScope': {
      if (actor.role === 'student') return false;
      const unique = [...new Set(ref.ids)];
      for (const id of unique) {
        if (!(await deps.isExistingStudent(db, id))) return false;
        if (!(await isStudentInScope(db, actor, id, deps.lookupPrimaryMentor))) return false;
      }
      return true;
    }
    case 'catalog':
      return deps.isActiveCatalogRef(db, ref.catalog, ref.id);
    case 'profileOfStudent':
      return deps.isProfileOfStudent(db, ref.id, ref.studentId);
    case 'taskOfStudent':
      return deps.isTaskOfStudent(db, ref.id, ref.studentId);
    case 'todo':
      // A reference kind without a rule is a programming error, never "allowed".
      throw new Error(`assertRefs: no rule implemented for ${ref.field} (${ref.reason})`);
  }
}
