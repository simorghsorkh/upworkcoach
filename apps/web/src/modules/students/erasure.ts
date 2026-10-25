import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { users } from '../identity/schema';
import { mentorAssignments, platformProfiles, profileSnapshots, students } from './schema';

/**
 * Account erasure support for the students module (ADR-0010, data-model.md 6-2).
 * Called only by identity.eraseUser inside its transaction. Schema-only imports, so
 * identity can use it without an import cycle.
 */

export const ERASED_NAME = 'کاربر حذف‌شده';
export const ERASED_TEXT = '[حذف شد]';

/**
 * Student: free text and anything that identifies the person or their platform accounts is
 * removed; structure (stage, track, level, joined_at, ids, dates) stays.
 */
export async function eraseStudentRecord(db: DbOrTx, userId: string, now: Date): Promise<void> {
  await db
    .update(students)
    .set({
      messengerHandle: null,
      primarySkill: null,
      goal90d: null,
      selfReportedBlocker: null,
      nicheStatement: null,
      incomeGoalUsd: null,
      statusReason: null,
      cohort: null,
      tags: [],
      searchText: ERASED_NAME,
      lifecycleStatus: 'dropped',
      pausedUntil: null,
      updatedAt: now,
    })
    .where(eq(students.userId, userId));

  // Platform profiles and snapshots are deleted completely (profile links are class 3).
  // `tasks.profile_id` becomes null through its ON DELETE SET NULL foreign key.
  const profileIds = (
    await db
      .select({ id: platformProfiles.id })
      .from(platformProfiles)
      .where(eq(platformProfiles.studentId, userId))
  ).map((r) => r.id);
  if (profileIds.length > 0) {
    await db.delete(profileSnapshots).where(inArray(profileSnapshots.profileId, profileIds));
    await db.delete(platformProfiles).where(inArray(platformProfiles.id, profileIds));
  }

  // A fixed marker (not null) keeps "required note" CHECKs intact.
  await db
    .update(mentorAssignments)
    .set({ reason: ERASED_TEXT })
    .where(and(eq(mentorAssignments.studentId, userId), isNotNull(mentorAssignments.reason)));
}

/**
 * Staff erasure precondition: still primary mentor of a (not erased) student → refuse.
 */
export async function countStudentsOfMentor(db: DbOrTx, mentorId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(eq(students.primaryMentorId, mentorId), isNull(users.erasedAt)));
  return row?.count ?? 0;
}
