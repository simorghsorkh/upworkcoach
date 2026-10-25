import { eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { attachments } from '@/modules/files/schema';
import { CliError, eraseUser } from '@/modules/identity/service';
import { reminders } from '@/modules/reminders/schema';
import { reviews, submissions, taskExtensions, tasks } from '@/modules/tasks/schema';
import { notes, timelineEvents } from '@/modules/timeline/schema';
import { getDb } from '@/server/db';
import { getStorage } from '@/server/storage';
import { dayFromToday, formWith, imageBytes, reminderFixture } from './fixtures';
import { call, createUser, loginAs } from './helpers';

/**
 * admin:erase-user for the sprint-3 tables (ADR-0010, data-model.md 6-2): free text and
 * files go, structure (statuses, outcome, score, counters, dates) stays; staff with open
 * reminders are refused.
 */

const CANARY = 'CANARY-ERASE-5c1d';

describe('erasure of a student with tasks, notes, reminders and attachments', () => {
  it('removes every free text and file; keeps the structure; idempotent', async () => {
    const mentor = await createUser('mentor');
    const student = await createUser('student', { mentorId: mentor.id, displayName: 'پاک‌شدنی' });
    const m = (await loginAs(mentor)).cookies;
    const s = (await loginAs(student)).cookies;

    const task = await call('POST', '/students/[id]/tasks', {
      cookies: m,
      params: { id: student.id },
      body: { title: 'کار', description: `${CANARY} شرح`, dueDate: dayFromToday(2) },
    });
    const taskId = task.body.id as string;
    await call('POST', '/tasks/[id]/extend', {
      cookies: m,
      params: { id: taskId },
      body: { newDueDate: dayFromToday(5), reason: `${CANARY} تمدید` },
    });
    const upload = await call('POST', '/attachments', {
      cookies: s,
      form: formWith(await imageBytes(), `${CANARY}.png`),
    });
    const sub = await call('POST', '/tasks/[id]/submissions', {
      cookies: s,
      params: { id: taskId },
      body: {
        bodyText: `${CANARY} متن`,
        links: [{ url: `https://example.com/${CANARY}`, label: CANARY }],
        attachmentIds: [upload.body.id],
      },
    });
    expect(sub.status).toBe(201);
    await call('POST', '/submissions/[id]/review', {
      cookies: m,
      params: { id: sub.body.id },
      body: { outcome: 'changes_requested', feedbackText: `${CANARY} بازخورد`, score: 2 },
    });
    const cancelled = await call('POST', '/students/[id]/tasks', {
      cookies: m,
      params: { id: student.id },
      body: { title: 'لغوی' },
    });
    await call('POST', '/tasks/[id]/cancel', {
      cookies: m,
      params: { id: cancelled.body.id },
      body: { reason: `${CANARY} لغو` },
    });
    await call('POST', '/students/[id]/notes', {
      cookies: m,
      params: { id: student.id },
      body: { body: `${CANARY} یادداشت`, visibility: 'shared' },
    });
    const reminderId = await reminderFixture(mentor.id, {
      studentId: student.id,
      text: `${CANARY} یادآور`,
    });
    const [att] = await getDb()
      .select({ key: attachments.storageKey })
      .from(attachments)
      .where(eq(attachments.id, upload.body.id));
    expect(await getStorage().exists(att?.key ?? '')).toBe(true);

    expect(
      await eraseUser({
        userId: student.id,
        confirmDisplayName: 'پاک‌شدنی',
        requestedOn: '2026-10-20',
      }),
    ).toBe('erased');

    // Free text is gone from every sprint-3 table.
    const taskIds = [taskId, cancelled.body.id as string];
    const dump = JSON.stringify([
      await getDb().select().from(tasks).where(inArray(tasks.id, taskIds)),
      await getDb().select().from(submissions).where(inArray(submissions.taskId, taskIds)),
      await getDb()
        .select()
        .from(reviews)
        .where(eq(reviews.submissionId, sub.body.id as string)),
      await getDb().select().from(taskExtensions).where(inArray(taskExtensions.taskId, taskIds)),
      await getDb().select().from(notes).where(eq(notes.studentId, student.id)),
      await getDb().select().from(reminders).where(eq(reminders.studentId, student.id)),
      await getDb().select().from(timelineEvents).where(eq(timelineEvents.studentId, student.id)),
      await getDb().select().from(attachments).where(eq(attachments.uploadedBy, student.id)),
    ]);
    expect(dump).not.toContain(CANARY);
    // Attachment: file and row deleted.
    expect(await getStorage().exists(att?.key ?? '')).toBe(false);
    // Notes: hard-deleted. Events: data emptied, types kept.
    expect(await getDb().select().from(notes).where(eq(notes.studentId, student.id))).toHaveLength(
      0,
    );
    const events = await getDb()
      .select({ type: timelineEvents.type, data: timelineEvents.data })
      .from(timelineEvents)
      .where(eq(timelineEvents.studentId, student.id));
    expect(events.length).toBeGreaterThan(3);
    expect(events.every((e) => JSON.stringify(e.data) === '{}')).toBe(true);
    // Structure stays: statuses, counters, outcome and score.
    const [t] = await getDb()
      .select({
        status: tasks.status,
        revisions: tasks.revisionCount,
        ext: tasks.extensionCount,
        title: tasks.title,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    expect(t).toEqual({ status: 'changes_requested', revisions: 1, ext: 1, title: 'کار' });
    const [r] = await getDb()
      .select({ outcome: reviews.outcome, score: reviews.score, text: reviews.feedbackText })
      .from(reviews)
      .where(eq(reviews.submissionId, sub.body.id as string));
    expect(r).toEqual({ outcome: 'changes_requested', score: 2, text: '[حذف شد]' });
    const [rem] = await getDb()
      .select({ status: reminders.status })
      .from(reminders)
      .where(eq(reminders.id, reminderId));
    expect(rem?.status).toBe('cancelled');

    expect(
      await eraseUser({
        userId: student.id,
        confirmDisplayName: 'کاربر حذف‌شده',
        requestedOn: '2026-10-20',
      }),
    ).toBe('already_erased');
  });

  it('refuses a mentor who still owns open reminders', async () => {
    const mentor = await createUser('mentor', { displayName: 'مشاور یادآوردار' });
    await reminderFixture(mentor.id);
    await expect(
      eraseUser({
        userId: mentor.id,
        confirmDisplayName: 'مشاور یادآوردار',
        requestedOn: '2026-10-20',
      }),
    ).rejects.toBeInstanceOf(CliError);
    await getDb()
      .update(reminders)
      .set({ status: 'cancelled' })
      .where(eq(reminders.ownerId, mentor.id));
    expect(
      await eraseUser({
        userId: mentor.id,
        confirmDisplayName: 'مشاور یادآوردار',
        requestedOn: '2026-10-20',
      }),
    ).toBe('erased');
  });
});
