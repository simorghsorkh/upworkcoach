import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { questionThreads } from './schema';

/**
 * Schema-only helpers of the questions module for other modules (no import cycle):
 * the mentor change (students.service) and staff erasure (identity.service).
 */

/**
 * ADR-0004 section 2: on a mentor change, the open and answered threads of this student
 * that were assigned to the old mentor move to the new one (or to the admin making the
 * change when the student becomes unassigned), in the caller's transaction.
 */
export async function transferOpenQuestionsOnMentorChange(
  tx: DbOrTx,
  studentId: string,
  fromMentorId: string | null,
  toUserId: string,
  now: Date,
): Promise<number> {
  if (!fromMentorId || fromMentorId === toUserId) return 0;
  const rows = await tx
    .update(questionThreads)
    .set({ assigneeId: toUserId, updatedAt: now })
    .where(
      and(
        eq(questionThreads.studentId, studentId),
        eq(questionThreads.assigneeId, fromMentorId),
        inArray(questionThreads.status, ['open', 'answered']),
      ),
    )
    .returning({ id: questionThreads.id });
  return rows.length;
}

/** Staff erasure precondition: open or answered threads assigned to this user. */
export async function countOpenQuestionsAssignedTo(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questionThreads)
    .where(
      and(
        eq(questionThreads.assigneeId, userId),
        inArray(questionThreads.status, ['open', 'answered']),
      ),
    );
  return row?.n ?? 0;
}
