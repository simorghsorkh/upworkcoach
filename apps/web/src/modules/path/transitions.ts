import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/server/db';
import { stages } from '../catalog/schema';
import { users } from '../identity/schema';
import { stageTransitions, type TransitionKind } from './schema';

/**
 * path — writes and reads of `stage_transitions`. Schema-only imports, so students.service
 * (initial transition on create) and identity (erasure) can use it without an import cycle;
 * path.service orchestrates stage changes.
 */

export async function insertTransition(
  db: DbOrTx,
  values: {
    studentId: string;
    fromStageId: string | null;
    toStageId: string;
    kind: TransitionKind;
    note: string | null;
    actorId: string;
  },
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(stageTransitions)
    .values({ ...values, createdAt: now })
    .returning({ id: stageTransitions.id });
  if (!row) throw new Error('insertTransition returned no row');
  return row.id;
}

const fromStages = alias(stages, 'from_stages');
const toStages = alias(stages, 'to_stages');

export async function listTransitions(db: DbOrTx, studentId: string) {
  return db
    .select({
      id: stageTransitions.id,
      kind: stageTransitions.kind,
      note: stageTransitions.note,
      createdAt: stageTransitions.createdAt,
      fromId: fromStages.id,
      fromName: fromStages.name,
      fromDisplayCode: fromStages.displayCode,
      toId: toStages.id,
      toName: toStages.name,
      toDisplayCode: toStages.displayCode,
      actorId: users.id,
      actorDisplayName: users.displayName,
    })
    .from(stageTransitions)
    .leftJoin(fromStages, eq(fromStages.id, stageTransitions.fromStageId))
    .innerJoin(toStages, eq(toStages.id, stageTransitions.toStageId))
    .innerJoin(users, eq(users.id, stageTransitions.actorId))
    .where(eq(stageTransitions.studentId, studentId))
    .orderBy(asc(stageTransitions.createdAt), asc(stageTransitions.id));
}

/** Erasure (ADR-0010): notes become a fixed marker; kinds and dates stay. */
export async function eraseTransitionNotes(db: DbOrTx, studentId: string): Promise<void> {
  await db
    .update(stageTransitions)
    .set({ note: '[حذف شد]' })
    .where(and(eq(stageTransitions.studentId, studentId), isNotNull(stageTransitions.note)));
}
