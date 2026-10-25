import { and, eq, inArray, ne } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { checkins } from '../checkins/schema';
import { studentFlags, studentHealth } from '../health/schema';
import { milestones } from '../milestones/schema';
import { questionMessages, questionThreads } from './schema';

/**
 * Account erasure of the sprint-4 tables (ADR-0010, data-model.md 6-2). Called only by
 * identity.eraseUser inside its transaction; schema-only imports. Free text goes; structure
 * (statuses, dates, mood, types) stays so SLA, response-time and North Star statistics are
 * unchanged. Returns the parents whose attachments must be purged.
 */
const ERASED_TEXT = '[حذف شد]';

export async function eraseSprint4OfStudent(
  db: DbOrTx,
  studentId: string,
  now: Date,
): Promise<{ questionMessageIds: string[]; milestoneIds: string[] }> {
  // Questions: subject replaced, open ones closed; every message in their threads (any
  // author — a reply may repeat the student's details) replaced.
  const threadIds = (
    await db
      .select({ id: questionThreads.id })
      .from(questionThreads)
      .where(eq(questionThreads.studentId, studentId))
  ).map((r) => r.id);
  let questionMessageIds: string[] = [];
  if (threadIds.length > 0) {
    await db
      .update(questionThreads)
      .set({ subject: ERASED_TEXT, updatedAt: now })
      .where(inArray(questionThreads.id, threadIds));
    await db
      .update(questionThreads)
      .set({ status: 'closed', awaiting: 'none', awaitingTeamSince: null, closedAt: now })
      .where(and(inArray(questionThreads.id, threadIds), ne(questionThreads.status, 'closed')));
    questionMessageIds = (
      await db
        .update(questionMessages)
        .set({ body: ERASED_TEXT, links: [] })
        .where(inArray(questionMessages.threadId, threadIds))
        .returning({ id: questionMessages.id })
    ).map((r) => r.id);
  }

  // Check-ins: text gone; mood and week stay.
  await db
    .update(checkins)
    .set({ activityText: null, blocker: null, nextWeekPlan: null })
    .where(eq(checkins.studentId, studentId));

  // Milestones: evidence and amount gone; type, status and day stay (anonymous North Star).
  // A fixed marker keeps the «rejection reason required» CHECK intact.
  const milestoneIds = (
    await db
      .update(milestones)
      .set({ evidenceText: null, amount: null, currency: null })
      .where(eq(milestones.studentId, studentId))
      .returning({ id: milestones.id })
  ).map((r) => r.id);
  await db
    .update(milestones)
    .set({ rejectionReason: ERASED_TEXT })
    .where(and(eq(milestones.studentId, studentId), eq(milestones.status, 'rejected')));

  // Flags: deleted completely. Health: no reasons, untracked.
  await db.delete(studentFlags).where(eq(studentFlags.studentId, studentId));
  await db
    .update(studentHealth)
    .set({
      status: 'untracked',
      reasons: [],
      churnRisk: false,
      redSince: null,
      snoozeReason: null,
      snoozedUntil: null,
      snoozedBy: null,
      statusSince: now,
      computedAt: now,
    })
    .where(eq(studentHealth.studentId, studentId));
  return { questionMessageIds, milestoneIds };
}
