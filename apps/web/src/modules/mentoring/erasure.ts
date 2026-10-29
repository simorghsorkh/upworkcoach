import { inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { enrollments } from '../programs/schema';
import { goals, mentoringSessions } from './schema';

/**
 * Account erasure (ADR-0010) of a mentee: their goals go, and their own sessions keep only the
 * time and outcome (no place, no cancellation reason). Schema-only imports.
 */
export async function eraseMentoringOfStudent(db: DbOrTx, studentId: string): Promise<void> {
  const own = db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(inArray(enrollments.studentId, [studentId]));
  await db.delete(goals).where(inArray(goals.enrollmentId, own));
  await db
    .update(mentoringSessions)
    .set({ location: null, cancelledReason: null })
    .where(inArray(mentoringSessions.enrollmentId, own));
}
