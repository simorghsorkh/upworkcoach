import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { checkins } from '@/modules/checkins/schema';
import { attachments } from '@/modules/files/schema';
import { studentFlags, studentHealth } from '@/modules/health/schema';
import { CliError, eraseUser } from '@/modules/identity/service';
import { milestones } from '@/modules/milestones/schema';
import { questionMessages, questionThreads } from '@/modules/questions/schema';
import { getDb } from '@/server/db';
import {
  dayFromToday,
  formWith,
  imageBytes,
  milestoneTypeFixture,
  questionFixture,
} from './fixtures';
import { call, createUser, loginAs } from './helpers';

/**
 * admin:erase-user for the sprint-4 tables (ADR-0010, data-model.md 6-2): question texts
 * (every author), check-in texts, milestone evidence and amount, flags and health reasons
 * go; statuses, mood, days and types stay. Staff who are assignees of open questions are
 * refused.
 */

const CANARY = 'CANARY-ERASE4-a8f0';

describe('erasure of a student with questions, check-ins, milestones, flags and health', () => {
  it('removes the free text and files, keeps the structure', async () => {
    const mentor = await createUser('mentor');
    const student = await createUser('student', { mentorId: mentor.id, displayName: 'پاک‌شدنی ۴' });
    const m = (await loginAs(mentor)).cookies;
    const s = (await loginAs(student)).cookies;

    const upload = await call('POST', '/attachments', {
      cookies: s,
      form: formWith(await imageBytes()),
    });
    const q = await call('POST', '/me/questions', {
      cookies: s,
      body: { subject: `${CANARY} موضوع`, body: `${CANARY} متن`, attachmentIds: [upload.body.id] },
    });
    await call('POST', '/questions/[id]/messages', {
      cookies: m,
      params: { id: q.body.id },
      body: { body: `${CANARY} پاسخ مشاور`, links: [{ url: `https://example.com/${CANARY}` }] },
    });
    await call('POST', '/me/checkins', {
      cookies: s,
      body: { activityText: `${CANARY} کار`, blocker: CANARY, mood: 2, needsHelp: false },
    });
    const typeId = await milestoneTypeFixture();
    const ms = await call('POST', '/me/milestones', {
      cookies: s,
      body: { typeId, occurredOn: dayFromToday(0), evidenceText: CANARY, amount: 100 },
    });
    await call('POST', '/milestones/[id]/reject', {
      cookies: m,
      params: { id: ms.body.id },
      body: { reason: `${CANARY} رد` },
    });
    await call('POST', '/students/[id]/flags', {
      cookies: m,
      params: { id: student.id },
      body: { category: 'personal', level: 'red', note: CANARY },
    });
    await call('PUT', '/students/[id]/health/snooze', {
      cookies: m,
      params: { id: student.id },
      body: { until: dayFromToday(2), reason: CANARY },
    });

    expect(
      await eraseUser({
        userId: student.id,
        confirmDisplayName: 'پاک‌شدنی ۴',
        requestedOn: '2026-10-20',
      }),
    ).toBe('erased');

    const dump = JSON.stringify([
      await getDb().select().from(questionThreads).where(eq(questionThreads.studentId, student.id)),
      await getDb().select().from(questionMessages).where(eq(questionMessages.threadId, q.body.id)),
      await getDb().select().from(checkins).where(eq(checkins.studentId, student.id)),
      await getDb().select().from(milestones).where(eq(milestones.studentId, student.id)),
      await getDb().select().from(studentHealth).where(eq(studentHealth.studentId, student.id)),
    ]);
    expect(dump).not.toContain(CANARY);
    const [thread] = await getDb()
      .select({ status: questionThreads.status, subject: questionThreads.subject })
      .from(questionThreads)
      .where(eq(questionThreads.id, q.body.id));
    expect(thread).toEqual({ status: 'closed', subject: '[حذف شد]' });
    const [checkin] = await getDb()
      .select({ mood: checkins.mood, activity: checkins.activityText })
      .from(checkins)
      .where(eq(checkins.studentId, student.id));
    expect(checkin).toEqual({ mood: 2, activity: null });
    const [milestone] = await getDb()
      .select({
        status: milestones.status,
        amount: milestones.amount,
        evidence: milestones.evidenceText,
      })
      .from(milestones)
      .where(eq(milestones.id, ms.body.id));
    expect(milestone).toEqual({ status: 'rejected', amount: null, evidence: null });
    expect(
      await getDb().select().from(studentFlags).where(eq(studentFlags.studentId, student.id)),
    ).toEqual([]);
    const [health] = await getDb()
      .select({ status: studentHealth.status, reasons: studentHealth.reasons })
      .from(studentHealth)
      .where(eq(studentHealth.studentId, student.id));
    expect(health).toEqual({ status: 'untracked', reasons: [] });
    const [att] = await getDb()
      .select({ status: attachments.status, messageId: attachments.questionMessageId })
      .from(attachments)
      .where(eq(attachments.id, upload.body.id));
    // Purged after the commit (or left as an anonymous pending row for files.cleanup).
    expect(att === undefined || (att.status === 'pending' && att.messageId === null)).toBe(true);
  });

  it('refuses a mentor who is still the assignee of an open question', async () => {
    const mentor = await createUser('mentor', { displayName: 'مشاور پاسخ‌گو' });
    const student = await createUser('student');
    const threadId = await questionFixture(student.id, mentor.id);
    await expect(
      eraseUser({
        userId: mentor.id,
        confirmDisplayName: 'مشاور پاسخ‌گو',
        requestedOn: '2026-10-20',
      }),
    ).rejects.toBeInstanceOf(CliError);
    await getDb()
      .update(questionThreads)
      .set({ status: 'closed', awaiting: 'none', closedAt: new Date() })
      .where(eq(questionThreads.id, threadId));
    expect(
      await eraseUser({
        userId: mentor.id,
        confirmDisplayName: 'مشاور پاسخ‌گو',
        requestedOn: '2026-10-20',
      }),
    ).toBe('erased');
  });
});
