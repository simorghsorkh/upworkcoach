import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { reminders } from './schema';

/**
 * Account erasure for the reminders module (ADR-0010, data-model.md 6-2). Called only by
 * identity.eraseUser inside its transaction; schema-only imports.
 */
const ERASED_TEXT = '[حذف شد]';

/** Reminders about the student: text replaced; open ones cancelled. */
export async function eraseRemindersAboutStudent(
  db: DbOrTx,
  studentId: string,
  now: Date,
): Promise<void> {
  await db
    .update(reminders)
    .set({ text: ERASED_TEXT, updatedAt: now })
    .where(eq(reminders.studentId, studentId));
  await db
    .update(reminders)
    .set({ status: 'cancelled', updatedAt: now })
    .where(and(eq(reminders.studentId, studentId), eq(reminders.status, 'open')));
}

/** Staff erasure precondition: open reminders owned by this user must be moved first. */
export async function countOpenRemindersOwnedBy(db: DbOrTx, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reminders)
    .where(and(eq(reminders.ownerId, ownerId), eq(reminders.status, 'open')));
  return row?.n ?? 0;
}
