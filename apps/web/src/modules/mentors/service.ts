import { normalizeForSearch } from '@/lib/text-fa';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { errors, INVALID_REF_MESSAGE } from '@/server/http/errors';
import { assertRefs } from '../access/refs';
import { recordAudit } from '../admin/service';
import type { AuditMeta } from '../catalog/service';
import { listMentors } from '../identity/service';
import { transferPrimaryEnrollments } from '../programs/service';
import { breachedReviewsByReviewer } from '../tasks/service';
import type {
  MentorCardDTO,
  MentorDetailDTO,
  MentorDirectoryDTO,
  MentorDirectoryQuery,
  MentorProfileDTO,
  TransferResultDTO,
  TransferStudentsInput,
  UpdateMentorProfileInput,
} from './contracts';
import * as repo from './repo';

/**
 * mentors — the directory of an organization's staff (Coach Office sprint 4): each one's card
 * (specialties, bio, capacity) and workload (students as primary or secondary mentor or run
 * staff, runs, overdue reviews). Every staff member reads the directory; a card's students
 * are for the admin and the mentor themselves. Assigning mentors to an enrollment lives in
 * the programs module; "transfer all" here moves every primary assignment at once.
 */

const EMPTY_PROFILE: MentorProfileDTO = {
  specialties: [],
  bio: null,
  capacity: null,
  acceptingStudents: true,
};

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

async function loadCards(db: DbOrTx, actor: Actor, now: Date): Promise<MentorCardDTO[]> {
  const [staff, profiles, load, overdue] = await Promise.all([
    listMentors(actor, db),
    repo.listProfiles(db, actor.organizationId),
    repo.workload(db, actor.organizationId),
    breachedReviewsByReviewer(db, actor.organizationId, now),
  ]);
  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const loadOf = new Map(load.map((l) => [l.userId, l]));
  return staff.map((s) => {
    const p = profileOf.get(s.id);
    const profile: MentorProfileDTO = p
      ? {
          specialties: p.specialties,
          bio: p.bio,
          capacity: p.capacity,
          acceptingStudents: p.acceptingStudents,
        }
      : EMPTY_PROFILE;
    const l = loadOf.get(s.id);
    const counts = {
      students: l?.students ?? 0,
      primary: l?.primary ?? 0,
      secondary: l?.secondary ?? 0,
      runs: l?.runs ?? 0,
      overdueReviews: overdue.get(s.id) ?? 0,
    };
    return {
      id: s.id,
      displayName: s.displayName,
      role: s.role,
      profile,
      counts,
      atCapacity: profile.capacity !== null && counts.primary >= profile.capacity,
    };
  });
}

/** GET /mentors (A, M): name search, specialty and "accepting students" filters. */
export async function listMentorDirectory(
  actor: Actor,
  query: MentorDirectoryQuery = {},
  db: DbOrTx = getDb(),
): Promise<MentorDirectoryDTO> {
  assertStaff(actor);
  const cards = await loadCards(db, actor, new Date());
  const specialties = [...new Set(cards.flatMap((c) => c.profile.specialties))].sort((a, b) =>
    a.localeCompare(b),
  );
  const needle = query.q ? normalizeForSearch(query.q) : '';
  const items = cards.filter(
    (c) =>
      (!needle ||
        normalizeForSearch(c.displayName).includes(needle) ||
        c.profile.specialties.some((s) => normalizeForSearch(s).includes(needle))) &&
      (!query.specialty || c.profile.specialties.includes(query.specialty)) &&
      (query.accepting === undefined ||
        (c.profile.acceptingStudents && !c.atCapacity) === query.accepting),
  );
  return { items, specialties };
}

async function loadCard(db: DbOrTx, actor: Actor, id: string): Promise<MentorCardDTO> {
  if (!isUuid(id)) throw errors.notFound();
  const card = (await loadCards(db, actor, new Date())).find((c) => c.id === id);
  if (!card) throw errors.notFound();
  return card;
}

/** GET /mentors/:id (A; M for themselves, anyone else is 404): card, students and runs. */
export async function getMentor(
  actor: Actor,
  id: string,
  db: DbOrTx = getDb(),
): Promise<MentorDetailDTO> {
  assertStaff(actor);
  if (actor.role !== 'admin' && actor.userId !== id) throw errors.notFound();
  const card = await loadCard(db, actor, id);
  const [students, runs] = await Promise.all([
    repo.studentsOf(db, actor.organizationId, id),
    repo.runsOf(db, actor.organizationId, id),
  ]);
  return {
    ...card,
    students: students.map((s) => ({
      enrollmentId: s.enrollmentId,
      student: { id: s.studentId, displayName: s.studentName },
      run: { id: s.runId, title: s.runTitle, isLegacy: s.legacyPathId !== null },
      role: s.role,
      enrollmentStatus: s.enrollmentStatus,
      since: s.since.toISOString(),
    })),
    runs,
    canEdit: true,
    canTransfer: actor.role === 'admin',
  };
}

/** PUT /mentors/:id/profile (A; M for themselves, anyone else is 404 like the detail). */
export async function updateMentorProfile(
  actor: Actor,
  id: string,
  input: UpdateMentorProfileInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<MentorDetailDTO> {
  assertStaff(actor);
  if (actor.role !== 'admin' && actor.userId !== id) throw errors.notFound();
  await loadCard(db, actor, id);
  const values: Parameters<typeof repo.upsertProfile>[3] = {};
  if (input.specialties !== undefined) values.specialties = input.specialties;
  if (input.bio !== undefined) values.bio = input.bio;
  if (input.capacity !== undefined) values.capacity = input.capacity;
  if (input.acceptingStudents !== undefined) values.acceptingStudents = input.acceptingStudents;
  await db.transaction(async (tx) => {
    await repo.upsertProfile(tx, actor.organizationId, id, values, actor.userId, new Date());
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'mentor.profile_updated',
      targetType: 'mentor',
      targetId: id,
      data: { fields: Object.keys(values) },
      ip: meta.ip ?? null,
    });
  });
  return getMentor(actor, id, db);
}

/**
 * POST /mentors/:id/transfer (A): every enrollment `id` is primary mentor of moves to
 * `toMentorId` (the legacy one through the student's mentor change). Secondary assignments and
 * run staff stay. Works for a mentor who has left too, as long as students remain with them.
 */
export async function transferMentorStudents(
  actor: Actor,
  id: string,
  input: TransferStudentsInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<TransferResultDTO> {
  if (actor.role !== 'admin') throw errors.forbidden();
  if (!isUuid(id)) throw errors.notFound();
  if (input.toMentorId === id) throw errors.validation({ toMentorId: INVALID_REF_MESSAGE });
  await assertRefs(db, actor, [{ field: 'toMentorId', kind: 'staffUser', id: input.toMentorId }]);
  const moved = await transferPrimaryEnrollments(
    actor,
    id,
    input.toMentorId,
    input.reason ?? null,
    meta,
    db,
  );
  if (moved === 0) await loadCard(db, actor, id);
  await recordAudit(db, {
    actorId: actor.userId,
    organizationId: actor.organizationId,
    action: 'mentor.students_transferred',
    targetType: 'mentor',
    targetId: id,
    data: { toMentorId: input.toMentorId, moved },
    ip: meta.ip ?? null,
  });
  return { moved };
}
