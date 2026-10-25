import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { notes, timelineEvents } from './schema';

/**
 * Account erasure for the timeline module (ADR-0010, data-model.md 6-2). Called only by
 * identity.eraseUser inside its transaction; schema-only imports.
 *  - notes about the student: deleted completely (hard delete, not soft);
 *  - timeline events about the student: `data = {}`; type and time stay.
 */
export async function eraseTimelineOfStudent(db: DbOrTx, studentId: string): Promise<void> {
  await db.delete(notes).where(eq(notes.studentId, studentId));
  await db.update(timelineEvents).set({ data: {} }).where(eq(timelineEvents.studentId, studentId));
}
