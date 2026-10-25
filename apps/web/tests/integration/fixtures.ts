import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { addDays, tehranDay, tehranDayEnd } from '@/lib/tehran-day';
import { milestoneTypes } from '@/modules/catalog/schema';
import { attachments } from '@/modules/files/schema';
import { studentFlags } from '@/modules/health/schema';
import { milestones } from '@/modules/milestones/schema';
import { questionMessages, questionThreads } from '@/modules/questions/schema';
import { reminders } from '@/modules/reminders/schema';
import { reviews, submissions, tasks } from '@/modules/tasks/schema';
import { notes } from '@/modules/timeline/schema';
import { getDb } from '@/server/db';

/**
 * Sprint-3 fixtures inserted directly (no API), for probes and setups. API behaviour is
 * tested through the routes; these only create the starting state.
 */

type TaskStatus =
  | 'open'
  | 'in_progress'
  | 'submitted'
  | 'changes_requested'
  | 'accepted'
  | 'cancelled';

export function dayFromToday(days: number): string {
  return addDays(tehranDay(), days);
}

export async function taskFixture(
  studentId: string,
  reviewerId: string,
  options: {
    status?: TaskStatus;
    submissionType?: 'text' | 'link' | 'file' | 'checkbox' | 'proposal_review' | 'profile_review';
    dueAt?: Date;
    title?: string;
    profileId?: string | null;
    requiredForGate?: boolean;
  } = {},
): Promise<string> {
  const now = new Date();
  const status = options.status ?? 'open';
  const dueAt = options.dueAt ?? tehranDayEnd(dayFromToday(3));
  const [row] = await getDb()
    .insert(tasks)
    .values({
      studentId,
      title: options.title ?? 'کار آزمایشی',
      kind: 'custom',
      submissionType: options.submissionType ?? 'text',
      status,
      dueAt,
      originalDueAt: dueAt,
      reviewerId,
      createdBy: reviewerId,
      statusChangedAt: now,
      lastSubmittedAt: status === 'submitted' ? now : null,
      closedAt: status === 'accepted' || status === 'cancelled' ? now : null,
      cancelReason: status === 'cancelled' ? 'آزمایشی' : null,
      profileId: options.profileId ?? null,
      requiredForGate: options.requiredForGate ?? false,
    })
    .returning({ id: tasks.id });
  if (!row) throw new Error('task fixture failed');
  return row.id;
}

/** A submitted task with version 1 (ready for review). */
export async function submittedTaskFixture(
  studentId: string,
  reviewerId: string,
  options: { bodyText?: string; submittedAt?: Date } = {},
): Promise<{ taskId: string; submissionId: string }> {
  const taskId = await taskFixture(studentId, reviewerId, { status: 'submitted' });
  const at = options.submittedAt ?? new Date();
  const [row] = await getDb()
    .insert(submissions)
    .values({
      taskId,
      version: 1,
      bodyText: options.bodyText ?? 'متن تحویل',
      submittedBy: studentId,
      createdAt: at,
    })
    .returning({ id: submissions.id });
  if (!row) throw new Error('submission fixture failed');
  if (options.submittedAt) {
    await getDb().update(tasks).set({ lastSubmittedAt: at }).where(eq(tasks.id, taskId));
  }
  return { taskId, submissionId: row.id };
}

/** A reviewed submission (task becomes changes_requested). */
export async function reviewFixture(
  studentId: string,
  reviewerId: string,
  options: { createdAt?: Date; feedbackText?: string } = {},
): Promise<{ taskId: string; submissionId: string; reviewId: string }> {
  const { taskId, submissionId } = await submittedTaskFixture(studentId, reviewerId);
  const at = options.createdAt ?? new Date();
  const [row] = await getDb()
    .insert(reviews)
    .values({
      submissionId,
      reviewerId,
      outcome: 'changes_requested',
      feedbackText: options.feedbackText ?? 'بازخورد آزمایشی',
      createdAt: at,
      updatedAt: at,
    })
    .returning({ id: reviews.id });
  if (!row) throw new Error('review fixture failed');
  await getDb()
    .update(tasks)
    .set({ status: 'changes_requested', revisionCount: 1 })
    .where(eq(tasks.id, taskId));
  return { taskId, submissionId, reviewId: row.id };
}

export async function noteFixture(
  studentId: string,
  authorId: string,
  options: { visibility?: 'internal' | 'shared'; body?: string } = {},
): Promise<string> {
  const now = new Date();
  const [row] = await getDb()
    .insert(notes)
    .values({
      studentId,
      authorId,
      visibility: options.visibility ?? 'internal',
      body: options.body ?? 'یادداشت آزمایشی',
      occurredAt: now,
    })
    .returning({ id: notes.id });
  if (!row) throw new Error('note fixture failed');
  return row.id;
}

export async function reminderFixture(
  ownerId: string,
  options: { studentId?: string | null; dueAt?: Date; text?: string } = {},
): Promise<string> {
  const [row] = await getDb()
    .insert(reminders)
    .values({
      ownerId,
      studentId: options.studentId ?? null,
      text: options.text ?? 'یادآور آزمایشی',
      dueAt: options.dueAt ?? new Date(Date.now() - 3600_000),
      createdBy: ownerId,
    })
    .returning({ id: reminders.id });
  if (!row) throw new Error('reminder fixture failed');
  return row.id;
}

/** A pending attachment row (no file behind it; for access probes only). */
export async function pendingAttachmentFixture(uploadedBy: string): Promise<string> {
  const [row] = await getDb()
    .insert(attachments)
    .values({
      storageKey: `attachments/fixture-${crypto.randomUUID()}`,
      originalName: 'fixture.png',
      mimeType: 'image/png',
      sizeBytes: 1,
      width: 1,
      height: 1,
      uploadedBy,
    })
    .returning({ id: attachments.id });
  if (!row) throw new Error('attachment fixture failed');
  return row.id;
}

/** A small real image (generated by sharp). */
export async function imageBytes(
  format: 'png' | 'jpeg' | 'webp' = 'png',
  size = { width: 16, height: 12 },
): Promise<Buffer> {
  const base = sharp({
    create: { width: size.width, height: size.height, channels: 3, background: '#3366ff' },
  });
  return format === 'png'
    ? base.png().toBuffer()
    : format === 'jpeg'
      ? base.jpeg().toBuffer()
      : base.webp().toBuffer();
}

export function formWith(bytes: Uint8Array, name = 'photo.png', type = 'image/png'): FormData {
  const form = new FormData();
  form.set('file', new File([bytes as unknown as BlobPart], name, { type }));
  return form;
}

// ---- sprint 4 ----------------------------------------------------------------------------

export async function questionFixture(
  studentId: string,
  assigneeId: string,
  options: {
    status?: 'open' | 'answered' | 'closed';
    subject?: string;
    body?: string;
    awaitingTeamSince?: Date;
    priority?: 'normal' | 'urgent';
  } = {},
): Promise<string> {
  const now = new Date();
  const status = options.status ?? 'open';
  const [thread] = await getDb()
    .insert(questionThreads)
    .values({
      studentId,
      subject: options.subject ?? 'سؤال آزمایشی',
      status,
      awaiting: status === 'open' ? 'team' : status === 'answered' ? 'student' : 'none',
      awaitingTeamSince: status === 'open' ? (options.awaitingTeamSince ?? now) : null,
      assigneeId,
      priority: options.priority ?? 'normal',
      lastMessageAt: now,
      closedAt: status === 'closed' ? now : null,
    })
    .returning({ id: questionThreads.id });
  if (!thread) throw new Error('question fixture failed');
  await getDb()
    .insert(questionMessages)
    .values({ threadId: thread.id, authorId: studentId, body: options.body ?? 'متن سؤال' });
  return thread.id;
}

export async function flagFixture(
  studentId: string,
  createdBy: string,
  options: { level?: 'yellow' | 'red'; note?: string } = {},
): Promise<string> {
  const [row] = await getDb()
    .insert(studentFlags)
    .values({
      studentId,
      category: 'personal',
      level: options.level ?? 'yellow',
      note: options.note ?? null,
      createdBy,
    })
    .returning({ id: studentFlags.id });
  if (!row) throw new Error('flag fixture failed');
  return row.id;
}

export async function milestoneTypeFixture(
  options: { uniquePerStudent?: boolean; requiresEvidence?: boolean; isActive?: boolean } = {},
): Promise<string> {
  const [row] = await getDb()
    .insert(milestoneTypes)
    .values({
      name: `نوع آزمایشی ${crypto.randomUUID().slice(0, 8)}`,
      uniquePerStudent: options.uniquePerStudent ?? false,
      requiresEvidence: options.requiresEvidence ?? false,
      isActive: options.isActive ?? true,
      sortOrder: 9_000,
    })
    .returning({ id: milestoneTypes.id });
  if (!row) throw new Error('milestone type fixture failed');
  return row.id;
}

export async function milestoneFixture(
  studentId: string,
  typeId: string,
  options: { status?: 'proposed' | 'approved' | 'rejected'; occurredOn?: string } = {},
): Promise<string> {
  const status = options.status ?? 'proposed';
  const [row] = await getDb()
    .insert(milestones)
    .values({
      studentId,
      typeId,
      occurredOn: options.occurredOn ?? dayFromToday(0),
      status,
      proposedBy: studentId,
      rejectionReason: status === 'rejected' ? 'آزمایشی' : null,
    })
    .returning({ id: milestones.id });
  if (!row) throw new Error('milestone fixture failed');
  return row.id;
}
