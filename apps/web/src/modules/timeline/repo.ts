import { and, desc, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { stages } from '../catalog/schema';
import { users } from '../identity/schema';
import type { NoteKind, NoteVisibility } from './contracts';
import { notes, timelineEvents } from './schema';

/**
 * timeline — queries (only used inside the module, plus `insertNote` for the initial note
 * of a new student). Columns are explicit (SEC-A9).
 */

const noteColumns = {
  id: notes.id,
  studentId: notes.studentId,
  authorId: notes.authorId,
  authorDisplayName: users.displayName,
  kind: notes.kind,
  visibility: notes.visibility,
  body: notes.body,
  tags: notes.tags,
  occurredAt: notes.occurredAt,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

export type NoteRow = NonNullable<Awaited<ReturnType<typeof findNote>>>;

export async function findNote(db: DbOrTx, id: string) {
  const [row] = await db
    .select(noteColumns)
    .from(notes)
    .innerJoin(users, eq(users.id, notes.authorId))
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)));
  return row ?? null;
}

export async function lockNote(db: DbOrTx, id: string) {
  const [row] = await db
    .select({
      id: notes.id,
      studentId: notes.studentId,
      authorId: notes.authorId,
      visibility: notes.visibility,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deletedAt)))
    .for('update');
  return row ?? null;
}

/**
 * Who reads a student's notes: private notes only reach their author, plus the student's
 * current mentors when `seesPrivate` (never the admin as such; ADR-0011 section 6).
 */
export type NoteViewer = { userId: string; seesPrivate: boolean };

/** Staff list (A, M after the scope check): not deleted, newest first. */
export async function listNotes(
  db: DbOrTx,
  studentId: string,
  viewer: NoteViewer,
  filter: { visibility?: NoteVisibility; kind?: NoteKind },
  limit: number,
  offset: number,
) {
  const conditions: SQL[] = [eq(notes.studentId, studentId), isNull(notes.deletedAt)];
  if (!viewer.seesPrivate) {
    const readable = or(ne(notes.visibility, 'private'), eq(notes.authorId, viewer.userId));
    if (readable) conditions.push(readable);
  }
  if (filter.visibility) conditions.push(eq(notes.visibility, filter.visibility));
  if (filter.kind) conditions.push(eq(notes.kind, filter.kind));
  return db
    .select(noteColumns)
    .from(notes)
    .innerJoin(users, eq(users.id, notes.authorId))
    .where(and(...conditions))
    .orderBy(desc(notes.occurredAt), desc(notes.id))
    .limit(limit)
    .offset(offset);
}

/**
 * THE ONLY function that reads `notes` for a student (ADR-0004 section 3, data-model.md 2-6
 * security invariant): shared and not deleted, hard-coded here. Returns only the columns of
 * `SharedNoteDTO`.
 */
export async function listSharedNotesForStudent(
  db: DbOrTx,
  studentId: string,
  limit: number,
  offset: number,
) {
  return db
    .select({
      id: notes.id,
      kind: notes.kind,
      body: notes.body,
      occurredAt: notes.occurredAt,
      authorDisplayName: users.displayName,
    })
    .from(notes)
    .innerJoin(users, eq(users.id, notes.authorId))
    .where(
      and(eq(notes.studentId, studentId), eq(notes.visibility, 'shared'), isNull(notes.deletedAt)),
    )
    .orderBy(desc(notes.occurredAt), desc(notes.id))
    .limit(limit)
    .offset(offset);
}

export async function insertNote(
  db: DbOrTx,
  values: {
    studentId: string;
    authorId: string;
    kind: NoteKind;
    visibility: NoteVisibility;
    body: string;
    tags: string[];
    occurredAt: Date;
  },
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(notes)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning({ id: notes.id });
  if (!row) throw new Error('insertNote returned no row');
  return row.id;
}

export async function updateNote(
  db: DbOrTx,
  id: string,
  values: Partial<{
    kind: NoteKind;
    visibility: NoteVisibility;
    body: string;
    tags: string[];
    occurredAt: Date;
    deletedAt: Date;
  }>,
  now: Date,
): Promise<void> {
  await db
    .update(notes)
    .set({ ...values, updatedAt: now })
    .where(eq(notes.id, id));
}

/** Events of one student, newest first, optionally restricted to some types. */
export async function listEvents(
  db: DbOrTx,
  studentId: string,
  types: readonly string[] | null,
  limit: number,
) {
  const conditions: SQL[] = [eq(timelineEvents.studentId, studentId)];
  if (types) conditions.push(inArray(timelineEvents.type, [...types]));
  return db
    .select({
      id: timelineEvents.id,
      type: timelineEvents.type,
      actorId: timelineEvents.actorId,
      actorDisplayName: users.displayName,
      subjectType: timelineEvents.subjectType,
      subjectId: timelineEvents.subjectId,
      data: timelineEvents.data,
      occurredAt: timelineEvents.occurredAt,
    })
    .from(timelineEvents)
    .leftJoin(users, eq(users.id, timelineEvents.actorId))
    .where(and(...conditions))
    .orderBy(desc(timelineEvents.occurredAt), desc(timelineEvents.id))
    .limit(limit);
}

export async function stageNames(db: DbOrTx, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: stages.id, name: stages.name, displayCode: stages.displayCode })
    .from(stages)
    .where(inArray(stages.id, [...ids]));
}

export async function userNames(db: DbOrTx, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, [...ids]));
}
