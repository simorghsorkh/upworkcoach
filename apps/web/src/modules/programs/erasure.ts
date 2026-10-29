import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { ERASED_TEXT } from '../students/erasure';
import { enrollmentMentors, enrollments, enrollmentTransitions, runStaff } from './schema';

/**
 * Account erasure support for the programs module (ADR-0010). Called only by
 * identity.eraseUser inside its transaction; schema-only imports.
 */

/** Free text about a student (assignment reasons, phase notes) becomes a fixed marker. */
export async function eraseProgramsOfStudent(db: DbOrTx, studentId: string): Promise<void> {
  const ofStudent = sql`(SELECT ${enrollments.id} FROM ${enrollments} WHERE ${enrollments.studentId} = ${studentId})`;
  await db
    .update(enrollmentMentors)
    .set({ reason: ERASED_TEXT })
    .where(
      and(inArray(enrollmentMentors.enrollmentId, ofStudent), isNotNull(enrollmentMentors.reason)),
    );
  await db
    .update(enrollmentTransitions)
    .set({ note: ERASED_TEXT })
    .where(
      and(
        inArray(enrollmentTransitions.enrollmentId, ofStudent),
        isNotNull(enrollmentTransitions.note),
      ),
    );
}

/** An erased staff member stops mentoring and staffing. */
export async function endStaffRolesOf(db: DbOrTx, userId: string, now: Date): Promise<void> {
  await db
    .update(enrollmentMentors)
    .set({ endedAt: now })
    .where(and(eq(enrollmentMentors.userId, userId), isNull(enrollmentMentors.endedAt)));
  await db
    .update(runStaff)
    .set({ endedAt: now })
    .where(and(eq(runStaff.userId, userId), isNull(runStaff.endedAt)));
}
