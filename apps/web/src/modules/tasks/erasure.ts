import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { reviews, submissions, taskExtensions, tasks } from './schema';

/**
 * Account erasure for the tasks module (ADR-0010, data-model.md 6-2). Called only by
 * identity.eraseUser inside its transaction; schema-only imports (no import cycle).
 * Free text goes, structure (ids, statuses, dates, counters, outcome, score) stays so the
 * mentor's statistics are unchanged. Returns the student's submission ids (attachments).
 */
const ERASED_TEXT = '[حذف شد]';

export async function eraseTasksOfStudent(db: DbOrTx, studentId: string): Promise<string[]> {
  const taskIds = (
    await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.studentId, studentId))
  ).map((r) => r.id);
  if (taskIds.length === 0) return [];

  const submissionIds = (
    await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(inArray(submissions.taskId, taskIds))
  ).map((r) => r.id);

  if (submissionIds.length > 0) {
    await db
      .update(submissions)
      .set({
        bodyText: null,
        jobPostText: null,
        proposalText: null,
        profileText: null,
        links: [],
        aiUseConsent: false,
        aiUseConsentAt: null,
      })
      .where(inArray(submissions.id, submissionIds));
    // Mentor feedback may repeat the student's details; outcome and score stay.
    await db
      .update(reviews)
      .set({ feedbackText: ERASED_TEXT })
      .where(inArray(reviews.submissionId, submissionIds));
  }

  // Title, status and dates stay. A fixed marker (not null) keeps the "cancel reason
  // required" CHECK intact.
  await db
    .update(tasks)
    .set({ description: null, profileId: null })
    .where(inArray(tasks.id, taskIds));
  await db
    .update(tasks)
    .set({ cancelReason: ERASED_TEXT })
    .where(and(inArray(tasks.id, taskIds), isNotNull(tasks.cancelReason)));
  await db
    .update(taskExtensions)
    .set({ reason: ERASED_TEXT })
    .where(inArray(taskExtensions.taskId, taskIds));
  return submissionIds;
}
