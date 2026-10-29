import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { decodeCursor, encodeCursor } from '@/server/http/schemas';
import { loadInScope, mentorWorksWithStudent } from '../access/scope';
import { recordAudit } from '../admin/service';
import type { AuditMeta } from '../catalog/service';
import type {
  CreateNoteInput,
  ListNotesQuery,
  NoteDTO,
  NoteListDTO,
  SharedNoteListDTO,
  SharedNotesQuery,
  TimelineCategory,
  TimelineDTO,
  TimelineItemDTO,
  TimelineQuery,
  UpdateNoteInput,
} from './contracts';
import { TIMELINE_EVENT_TYPES } from './events';
import * as repo from './repo';

/**
 * timeline — notes (internal by default, or shared) and the record timeline (PRD F5,
 * api.md section 7). Every public function takes `actor` first (ADR-0004).
 *
 * Students read notes ONLY through `listOwnSharedNotes` → `repo.listSharedNotesForStudent`
 * (shared + not deleted, hard-coded in that one query). Students never see the timeline.
 * Editing/deleting a note: admin, or the author while the student is in their CURRENT
 * scope (C3, SEC-A6) — a former mentor gets 404 like for any other resource.
 */

const DEFAULT_LIMIT = 50;
/** A note may be logged slightly ahead of the clock (device skew), not in the future. */
const FUTURE_SLACK_MS = 10 * 60 * 1000;

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

function assertNotFuture(occurredAt: Date | undefined, now: Date): void {
  if (occurredAt && occurredAt.getTime() > now.getTime() + FUTURE_SLACK_MS) {
    throw errors.validation({ occurredAt: 'زمان یادداشت نمی‌تواند در آینده باشد.' });
  }
}

function offsetOf(cursor: string | undefined): number {
  const offset = decodeCursor(cursor);
  if (offset < 0) throw errors.validation({ cursor: 'مقدار نامعتبر است' });
  return offset;
}

function canEdit(actor: Actor, authorId: string): boolean {
  // Callers already proved the student is in the actor's scope.
  return actor.role === 'admin' || (actor.role === 'mentor' && authorId === actor.userId);
}

function toNoteDTO(actor: Actor, row: repo.NoteRow): NoteDTO {
  return {
    id: row.id,
    studentId: row.studentId,
    kind: row.kind,
    visibility: row.visibility,
    body: row.body,
    tags: row.tags,
    occurredAt: row.occurredAt.toISOString(),
    author: { id: row.authorId, displayName: row.authorDisplayName },
    canEdit: canEdit(actor, row.authorId),
    isAuthor: row.authorId === actor.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Private notes of others reach a staff member only while they mentor the student. */
async function noteViewer(db: DbOrTx, actor: Actor, studentId: string): Promise<repo.NoteViewer> {
  return {
    userId: actor.userId,
    seesPrivate: await mentorWorksWithStudent(db, actor.userId, actor.organizationId, studentId),
  };
}

async function loadNoteDTO(db: DbOrTx, actor: Actor, noteId: string): Promise<NoteDTO> {
  const row = await repo.findNote(db, noteId);
  if (!row) throw errors.notFound();
  return toNoteDTO(actor, row);
}

// ---- notes (staff) ---------------------------------------------------------------------

/** GET /students/:id/notes (A, M in scope): newest first; private ones per `NoteViewer`. */
export async function listStudentNotes(
  actor: Actor,
  studentId: string,
  query: ListNotesQuery = {},
  db: DbOrTx = getDb(),
): Promise<NoteListDTO> {
  assertStaff(actor);
  await loadInScope(db, actor, 'student', studentId);
  const offset = offsetOf(query.cursor);
  const limit = query.limit ?? DEFAULT_LIMIT;
  const rows = await repo.listNotes(
    db,
    studentId,
    await noteViewer(db, actor, studentId),
    { visibility: query.visibility, kind: query.kind },
    limit + 1,
    offset,
  );
  return {
    items: rows.slice(0, limit).map((r) => toNoteDTO(actor, r)),
    nextCursor: rows.length > limit ? encodeCursor(offset + limit) : null,
  };
}

/** POST /students/:id/notes (A, M in scope). Default visibility: internal (F5). */
export async function createNote(
  actor: Actor,
  studentId: string,
  input: CreateNoteInput,
  db: Db = getDb(),
): Promise<NoteDTO> {
  assertStaff(actor);
  const now = new Date();
  assertNotFuture(input.occurredAt, now);
  return db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    const id = await repo.insertNote(
      tx,
      {
        studentId,
        authorId: actor.userId,
        kind: input.kind ?? 'note',
        visibility: input.visibility ?? 'internal',
        body: input.body,
        tags: input.tags ?? [],
        occurredAt: input.occurredAt ?? now,
      },
      now,
    );
    return loadNoteDTO(tx, actor, id);
  });
}

/**
 * Loads a note for a write: admin → any note in scope except another author's private note;
 * mentor → author AND the student in the current scope. Anything else (missing, deleted,
 * other author, former mentor) → 404.
 */
async function loadNoteForWrite(tx: DbOrTx, actor: Actor, noteId: string) {
  assertStaff(actor);
  const { resource } = await loadInScope<{ id: string; authorId: string }>(
    tx,
    actor,
    'note',
    noteId,
  );
  if (actor.role !== 'admin' && resource.authorId !== actor.userId) throw errors.notFound();
  const locked = await repo.lockNote(tx, noteId);
  if (!locked) throw errors.notFound();
  if (locked.visibility === 'private' && locked.authorId !== actor.userId) throw errors.notFound();
  return locked;
}

/**
 * PATCH /notes/:id (A; M author + in scope). Becoming shared is audited
 * (`note.visibility_changed`, SEC-L7); the UI asks for a confirmation first (SEC-F6).
 * Only the author makes a note private (an admin would hide someone else's note).
 */
export async function updateNote(
  actor: Actor,
  noteId: string,
  input: UpdateNoteInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<NoteDTO> {
  const now = new Date();
  assertNotFuture(input.occurredAt, now);
  return db.transaction(async (tx) => {
    const locked = await loadNoteForWrite(tx, actor, noteId);
    if (input.ifUpdatedAt && input.ifUpdatedAt.getTime() !== locked.updatedAt.getTime()) {
      throw errors.conflict('این یادداشت در این فاصله تغییر کرده است. صفحه را تازه کن.');
    }
    if (input.visibility === 'private' && locked.authorId !== actor.userId) {
      throw errors.forbidden();
    }
    const values: Parameters<typeof repo.updateNote>[2] = {};
    if (input.kind !== undefined) values.kind = input.kind;
    if (input.visibility !== undefined) values.visibility = input.visibility;
    if (input.body !== undefined) values.body = input.body;
    if (input.tags !== undefined) values.tags = input.tags;
    if (input.occurredAt !== undefined) values.occurredAt = input.occurredAt;
    if (Object.keys(values).length > 0) await repo.updateNote(tx, noteId, values, now);
    if (locked.visibility !== 'shared' && input.visibility === 'shared') {
      await recordAudit(tx, {
        actorId: actor.userId,
        action: 'note.visibility_changed',
        targetType: 'note',
        targetId: noteId,
        data: { from: locked.visibility, to: 'shared', studentId: locked.studentId },
        ip: meta.ip ?? null,
      });
    }
    return loadNoteDTO(tx, actor, noteId);
  });
}

/** DELETE /notes/:id (A; M author + in scope): soft delete; afterwards 404 for everyone. */
export async function deleteNote(actor: Actor, noteId: string, db: Db = getDb()): Promise<void> {
  await db.transaction(async (tx) => {
    await loadNoteForWrite(tx, actor, noteId);
    const now = new Date();
    await repo.updateNote(tx, noteId, { deletedAt: now }, now);
  });
}

// ---- the student's view ----------------------------------------------------------------

/** GET /me/shared-notes (S): the only route where a student sees notes. */
export async function listOwnSharedNotes(
  actor: Actor,
  query: SharedNotesQuery = {},
  db: DbOrTx = getDb(),
): Promise<SharedNoteListDTO> {
  if (actor.role !== 'student') throw errors.forbidden();
  const offset = offsetOf(query.cursor);
  const limit = query.limit ?? DEFAULT_LIMIT;
  const rows = await repo.listSharedNotesForStudent(db, actor.userId, limit + 1, offset);
  return {
    items: rows.slice(0, limit).map((r) => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      occurredAt: r.occurredAt.toISOString(),
      author: { displayName: r.authorDisplayName },
    })),
    nextCursor: rows.length > limit ? encodeCursor(offset + limit) : null,
  };
}

// ---- timeline --------------------------------------------------------------------------

/** Category of an automatic event type (filter of F5). */
export function categoryOf(type: string): TimelineCategory {
  const prefix = type.split('.')[0] ?? '';
  switch (prefix) {
    case 'student':
    case 'mentor':
    case 'invite':
      return 'student';
    case 'stage':
      return 'stage';
    case 'profile':
      return 'profile';
    case 'task':
    case 'submission':
    case 'review':
      return 'task';
    case 'question':
      return 'question';
    case 'checkin':
      return 'checkin';
    case 'milestone':
      return 'milestone';
    case 'flag':
      return 'flag';
    default:
      return 'health';
  }
}

/** Event types of the chosen categories (`null` = all). */
export function eventTypesFor(
  categories: readonly TimelineCategory[] | undefined,
): string[] | null {
  if (!categories) return null;
  return TIMELINE_EVENT_TYPES.filter((t) => categories.includes(categoryOf(t)));
}

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * GET /students/:id/timeline (A, M in scope): `timeline_events` + notes (not deleted) in one
 * list, newest first, with a category filter (F5). Notes are never copied into
 * `timeline_events`, so visibility has a single source.
 */
export async function getTimeline(
  actor: Actor,
  studentId: string,
  query: TimelineQuery = {},
  db: DbOrTx = getDb(),
): Promise<TimelineDTO> {
  assertStaff(actor);
  await loadInScope(db, actor, 'student', studentId);
  const offset = offsetOf(query.cursor);
  const limit = query.limit ?? DEFAULT_LIMIT;
  const wantNotes = !query.types || query.types.includes('note');
  const eventTypes = eventTypesFor(query.types?.filter((t) => t !== 'note'));
  const window = offset + limit + 1;
  const [events, noteRows] = await Promise.all([
    eventTypes && eventTypes.length === 0
      ? Promise.resolve([])
      : repo.listEvents(db, studentId, eventTypes, window),
    wantNotes
      ? repo.listNotes(db, studentId, await noteViewer(db, actor, studentId), {}, window, 0)
      : Promise.resolve([]),
  ]);

  const merged: TimelineItemDTO[] = [
    ...events.map(
      (e): TimelineItemDTO => ({
        kind: 'event',
        id: e.id,
        type: e.type,
        category: categoryOf(e.type),
        occurredAt: e.occurredAt.toISOString(),
        actor:
          e.actorId && e.actorDisplayName
            ? { id: e.actorId, displayName: e.actorDisplayName }
            : null,
        subject: e.subjectType && e.subjectId ? { type: e.subjectType, id: e.subjectId } : null,
        data: e.data,
      }),
    ),
    ...noteRows.map((n): TimelineItemDTO => {
      const note = toNoteDTO(actor, n);
      return {
        kind: 'note',
        id: n.id,
        type: n.kind,
        category: 'note',
        occurredAt: note.occurredAt,
        actor: note.author,
        note,
      };
    }),
  ].sort((a, b) =>
    a.occurredAt === b.occurredAt
      ? b.id.localeCompare(a.id)
      : b.occurredAt.localeCompare(a.occurredAt),
  );
  const page = merged.slice(offset, offset + limit);

  // Display names of ids in event data (stage changes, mentor changes).
  const stageIds = new Set<string>();
  const userIds = new Set<string>();
  for (const item of page) {
    if (item.kind !== 'event') continue;
    const d = item.data;
    if (item.type === 'stage.changed') {
      for (const v of [asString(d.from), asString(d.to)]) if (v) stageIds.add(v);
    }
    if (item.type === 'student.created') {
      const stage = asString(d.stageId);
      const mentor = asString(d.mentorId);
      if (stage) stageIds.add(stage);
      if (mentor) userIds.add(mentor);
    }
    if (item.type === 'mentor.changed') {
      for (const v of [asString(d.from), asString(d.to)]) if (v) userIds.add(v);
    }
  }
  const [stageRows, userRows] = await Promise.all([
    repo.stageNames(db, [...stageIds]),
    repo.userNames(db, [...userIds]),
  ]);
  return {
    items: page,
    nextCursor: merged.length > offset + limit ? encodeCursor(offset + limit) : null,
    refs: {
      stages: Object.fromEntries(
        stageRows.map((s) => [s.id, { name: s.name, displayCode: s.displayCode }]),
      ),
      users: Object.fromEntries(userRows.map((u) => [u.id, { displayName: u.displayName }])),
    },
  };
}

// ---- internal (other modules' services; no actor) --------------------------------------

/** The initial note of a new student (POST /students `initialNote`); always internal. */
export async function insertInitialNote(
  tx: DbOrTx,
  input: { studentId: string; authorId: string; body: string },
  now: Date,
): Promise<void> {
  await repo.insertNote(
    tx,
    {
      studentId: input.studentId,
      authorId: input.authorId,
      kind: 'note',
      visibility: 'internal',
      body: input.body,
      tags: [],
      occurredAt: now,
    },
    now,
  );
}
