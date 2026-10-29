import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { checkins } from '../checkins/schema';
import { attachments } from '../files/schema';
import { studentFlags } from '../health/schema';
import { milestones } from '../milestones/schema';
import { questionMessages, questionThreads } from '../questions/schema';
import { platformProfiles, students } from '../students/schema';
import { reviews, submissions, tasks } from '../tasks/schema';
import { notes } from '../timeline/schema';

/**
 * access — read-only lookups of the scope root of student-owned resources (ADR-0004
 * section 1). Assumption (sprint-2 notes): `access` reads `students.primary_mentor_id`
 * and the parent keys of student-owned tables directly, like the read-models `today` and
 * `health`. Going through students.service would create an import cycle
 * (students → identity → access). It never writes.
 */

export async function findStudentOrganization(
  db: DbOrTx,
  studentId: string,
): Promise<{ organizationId: string } | null> {
  const [row] = await db
    .select({ organizationId: students.organizationId })
    .from(students)
    .where(eq(students.userId, studentId));
  return row ?? null;
}

export async function findProfileRoot(
  db: DbOrTx,
  profileId: string,
): Promise<{ studentId: string; organizationId: string } | null> {
  const [row] = await db
    .select({
      studentId: platformProfiles.studentId,
      organizationId: students.organizationId,
    })
    .from(platformProfiles)
    .innerJoin(students, eq(students.userId, platformProfiles.studentId))
    .where(and(eq(platformProfiles.id, profileId), isNull(platformProfiles.deletedAt)));
  return row ?? null;
}

/** profileId reference rule: same student, not deleted (ADR-0004 1-1). */
export async function isProfileOfStudent(
  db: DbOrTx,
  profileId: string,
  studentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: platformProfiles.id })
    .from(platformProfiles)
    .where(
      and(
        eq(platformProfiles.id, profileId),
        eq(platformProfiles.studentId, studentId),
        isNull(platformProfiles.deletedAt),
      ),
    );
  return row !== undefined;
}

// ---- sprint 3: tasks, submissions, reviews, notes, attachments -----------------------
// Each resolver walks from the resource to its root `student_id` (ADR-0004 section 1).

export async function findTaskRoot(
  db: DbOrTx,
  taskId: string,
): Promise<{ studentId: string; organizationId: string } | null> {
  const [row] = await db
    .select({
      studentId: tasks.studentId,
      organizationId: students.organizationId,
    })
    .from(tasks)
    .innerJoin(students, eq(students.userId, tasks.studentId))
    .where(eq(tasks.id, taskId));
  return row ?? null;
}

export async function findSubmissionRoot(
  db: DbOrTx,
  submissionId: string,
): Promise<{
  studentId: string;

  organizationId: string;
  taskId: string;
} | null> {
  const [row] = await db
    .select({
      studentId: tasks.studentId,
      organizationId: students.organizationId,
      taskId: tasks.id,
    })
    .from(submissions)
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .innerJoin(students, eq(students.userId, tasks.studentId))
    .where(eq(submissions.id, submissionId));
  return row ?? null;
}

/** review → submission → task → student (the two-level case of security.md B1). */
export async function findReviewRoot(
  db: DbOrTx,
  reviewId: string,
): Promise<{
  studentId: string;

  organizationId: string;
  reviewerId: string;
} | null> {
  const [row] = await db
    .select({
      studentId: tasks.studentId,
      organizationId: students.organizationId,
      reviewerId: reviews.reviewerId,
    })
    .from(reviews)
    .innerJoin(submissions, eq(submissions.id, reviews.submissionId))
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .innerJoin(students, eq(students.userId, tasks.studentId))
    .where(eq(reviews.id, reviewId));
  return row ?? null;
}

/** Deleted notes do not exist for anyone. */
export async function findNoteRoot(
  db: DbOrTx,
  noteId: string,
): Promise<{
  studentId: string;

  organizationId: string;
  authorId: string;
} | null> {
  const [row] = await db
    .select({
      studentId: notes.studentId,
      organizationId: students.organizationId,
      authorId: notes.authorId,
    })
    .from(notes)
    .innerJoin(students, eq(students.userId, notes.studentId))
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
  return row ?? null;
}

/**
 * attachment → linked parent (submission → task, question message → thread, milestone) →
 * student. Pending attachments have no student root; only their uploader may read them
 * (checked by the files module). For a question message the thread's assignee and status
 * come along (an out-of-scope assignee may read it while the thread is open; ADR-0004).
 */
export async function findAttachmentRoot(
  db: DbOrTx,
  attachmentId: string,
): Promise<{
  studentId: string;

  organizationId: string;
  thread: { id: string; assigneeId: string; status: string } | null;
} | null> {
  const studentOf = sql<string>`coalesce(${tasks.studentId}, ${questionThreads.studentId}, ${milestones.studentId})`;
  const [row] = await db
    .select({
      studentId: students.userId,
      organizationId: students.organizationId,
      threadId: questionThreads.id,
      assigneeId: questionThreads.assigneeId,
      threadStatus: questionThreads.status,
    })
    .from(attachments)
    .leftJoin(submissions, eq(submissions.id, attachments.submissionId))
    .leftJoin(tasks, eq(tasks.id, submissions.taskId))
    .leftJoin(questionMessages, eq(questionMessages.id, attachments.questionMessageId))
    .leftJoin(questionThreads, eq(questionThreads.id, questionMessages.threadId))
    .leftJoin(milestones, eq(milestones.id, attachments.milestoneId))
    .innerJoin(students, eq(students.userId, studentOf))
    .where(and(eq(attachments.id, attachmentId), eq(attachments.status, 'linked')));
  if (!row) return null;
  return {
    studentId: row.studentId,
    organizationId: row.organizationId,
    thread:
      row.threadId && row.assigneeId && row.threadStatus
        ? { id: row.threadId, assigneeId: row.assigneeId, status: row.threadStatus }
        : null,
  };
}

// ---- sprint 4: questions, milestones, check-ins, flags ---------------------------------

export async function findQuestionRoot(
  db: DbOrTx,
  threadId: string,
): Promise<{
  studentId: string;

  organizationId: string;
  assigneeId: string;
  status: 'open' | 'answered' | 'closed';
} | null> {
  const [row] = await db
    .select({
      studentId: questionThreads.studentId,
      organizationId: students.organizationId,
      assigneeId: questionThreads.assigneeId,
      status: questionThreads.status,
    })
    .from(questionThreads)
    .innerJoin(students, eq(students.userId, questionThreads.studentId))
    .where(eq(questionThreads.id, threadId));
  return row ?? null;
}

/** C3 / SEC-A8: the actor is the assignee of an open or answered thread of this student. */
export async function isAssigneeOfOpenThread(
  db: DbOrTx,
  assigneeId: string,
  studentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: questionThreads.id })
    .from(questionThreads)
    .where(
      and(
        eq(questionThreads.assigneeId, assigneeId),
        eq(questionThreads.studentId, studentId),
        inArray(questionThreads.status, ['open', 'answered']),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function findMilestoneRoot(
  db: DbOrTx,
  milestoneId: string,
): Promise<{ studentId: string; organizationId: string } | null> {
  const [row] = await db
    .select({
      studentId: milestones.studentId,
      organizationId: students.organizationId,
    })
    .from(milestones)
    .innerJoin(students, eq(students.userId, milestones.studentId))
    .where(eq(milestones.id, milestoneId));
  return row ?? null;
}

export async function findCheckinRoot(
  db: DbOrTx,
  checkinId: string,
): Promise<{ studentId: string; organizationId: string } | null> {
  const [row] = await db
    .select({
      studentId: checkins.studentId,
      organizationId: students.organizationId,
    })
    .from(checkins)
    .innerJoin(students, eq(students.userId, checkins.studentId))
    .where(eq(checkins.id, checkinId));
  return row ?? null;
}

export async function findFlagRoot(
  db: DbOrTx,
  flagId: string,
): Promise<{ studentId: string; organizationId: string } | null> {
  const [row] = await db
    .select({
      studentId: studentFlags.studentId,
      organizationId: students.organizationId,
    })
    .from(studentFlags)
    .innerJoin(students, eq(students.userId, studentFlags.studentId))
    .where(eq(studentFlags.id, flagId));
  return row ?? null;
}

/** taskId reference rule (ADR-0004 1-1): the task belongs to the same student. */
export async function isTaskOfStudent(
  db: DbOrTx,
  taskId: string,
  studentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.studentId, studentId)));
  return row !== undefined;
}
