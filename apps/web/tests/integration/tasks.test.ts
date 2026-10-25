import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { tehranDayEnd } from '@/lib/tehran-day';
import { platformProfiles, profileSnapshots } from '@/modules/students/schema';
import { submissions, tasks } from '@/modules/tasks/schema';
import { timelineEvents } from '@/modules/timeline/schema';
import { getDb } from '@/server/db';
import { dayFromToday, reviewFixture, submittedTaskFixture, taskFixture } from './fixtures';
import { call, createUser, loginAs, SEEDED, type TestUser } from './helpers';

/**
 * Tasks (PRD F4, api.md section 6): creation (single, template, bulk), the full status
 * cycle through the API, the student DTO (T-DTO), reference ids (T-REF), scope (404),
 * counters on the student list / record, the review queue and the timeline events.
 */

const MISSING = '01900000-0000-7000-8000-00000000beef';

let admin: TestUser;
let mentor: TestUser;
let otherMentor: TestUser;
let student: TestUser;
let otherStudent: TestUser;
const c: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor');
  otherMentor = await createUser('mentor');
  student = await createUser('student', { mentorId: mentor.id });
  otherStudent = await createUser('student', { mentorId: otherMentor.id });
  for (const [key, user] of Object.entries({ admin, mentor, otherMentor, student, otherStudent })) {
    c[key] = (await loginAs(user)).cookies;
  }
});

const as = (who: string) => ({ cookies: c[who] });

async function createTaskAs(who: string, studentId: string, body: Record<string, unknown>) {
  return call('POST', '/students/[id]/tasks', { ...as(who), params: { id: studentId }, body });
}

/** T-DTO: the student's task shapes, strict (an extra field fails). */
const reviewSchema = z.strictObject({
  outcome: z.enum(['accepted', 'changes_requested']),
  feedbackText: z.string(),
  score: z.number().nullable(),
  createdAt: z.string(),
  // Sprint-3 frontend gap 2: the display name only — never the reviewer id.
  reviewer: z.strictObject({ displayName: z.string() }),
});
const attachmentSchema = z.strictObject({
  id: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  width: z.number(),
  height: z.number(),
  originalName: z.string(),
  href: z.string(),
});
const listItemShape = {
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  kind: z.string(),
  submissionType: z.string(),
  stage: z.strictObject({ id: z.string(), name: z.string(), displayCode: z.string() }).nullable(),
  priority: z.string(),
  status: z.string(),
  dueAt: z.string(),
  overdue: z.boolean(),
  overdueDays: z.number(),
  latestReview: z.strictObject({ outcome: z.string(), createdAt: z.string() }).nullable(),
};
const studentListItemSchema = z.strictObject(listItemShape);
const studentTaskSchema = z.strictObject({
  ...listItemShape,
  submissions: z.array(
    z.strictObject({
      id: z.string(),
      version: z.number(),
      createdAt: z.string(),
      bodyText: z.string().nullable(),
      links: z.array(z.strictObject({ url: z.string(), label: z.string().nullable() })),
      platform: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
      jobPostText: z.string().nullable(),
      proposalText: z.string().nullable(),
      profileText: z.string().nullable(),
      aiUseConsent: z.boolean(),
      attachments: z.array(attachmentSchema),
      review: reviewSchema.nullable(),
    }),
  ),
});

describe('create a task (POST /students/:id/tasks)', () => {
  it('due date = end of the Tehran day; reviewer defaults to the primary mentor', async () => {
    const day = dayFromToday(4);
    const res = await createTaskAs('admin', student.id, {
      title: 'بازنویسی Overview',
      description: 'وقتی قبول است که مشکل کارفرما در جمله‌ی اول باشد.',
      kind: 'custom',
      submissionType: 'text',
      dueDate: day,
      stageId: SEEDED.stages[2],
    });
    expect(res.status).toBe(201);
    expect(res.body.dueAt).toBe(tehranDayEnd(day).toISOString());
    expect(res.body.originalDueAt).toBe(res.body.dueAt);
    expect(res.body.reviewer.id).toBe(mentor.id);
    expect(res.body.createdBy.id).toBe(admin.id);
    expect(res.body.status).toBe('open');
    expect(res.body.stage.id).toBe(SEEDED.stages[2]);
    expect(res.body.revisionCount).toBe(0);
  });

  it('from a template: title, type, gate and default days come from the template', async () => {
    const res = await createTaskAs('mentor', student.id, {
      templateId: SEEDED.taskTemplates[9], // «۳ پروپوزال کالیبره»: proposal_review, 7 days
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('۳ پروپوزال کالیبره');
    expect(res.body.submissionType).toBe('proposal_review');
    expect(res.body.requiredForGate).toBe(true);
    expect(res.body.templateId).toBe(SEEDED.taskTemplates[9]);
    expect(res.body.dueAt).toBe(tehranDayEnd(dayFromToday(7)).toISOString());
  });

  it('without a template the title is required; a past due date is refused (422)', async () => {
    expect((await createTaskAs('mentor', student.id, {})).body.error.fields).toHaveProperty(
      'title',
    );
    const past = await createTaskAs('mentor', student.id, {
      title: 'x',
      dueDate: dayFromToday(-1),
    });
    expect(past.status).toBe(422);
    expect(past.body.error.fields).toHaveProperty('dueDate');
  });

  it('the deadline cannot be set through PATCH (unknown key → 422)', async () => {
    const id = await taskFixture(student.id, mentor.id);
    const res = await call('PATCH', '/tasks/[id]', {
      ...as('mentor'),
      params: { id },
      body: { dueDate: dayFromToday(9) },
    });
    expect(res.status).toBe(422);
  });

  it('T-REF: other student’s profile, a student as reviewer, inactive stage/template → 422, nothing written', async () => {
    const [foreign] = await getDb()
      .insert(platformProfiles)
      .values({
        studentId: otherStudent.id,
        platformId: SEEDED.platforms.upwork,
        kind: 'profile',
        createdBy: otherStudent.id,
      })
      .returning({ id: platformProfiles.id });
    const before = await getDb()
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.studentId, student.id));
    for (const [body, field] of [
      [{ title: 'x', profileId: foreign?.id }, 'profileId'],
      [{ title: 'x', reviewerId: otherStudent.id }, 'reviewerId'],
      [{ title: 'x', stageId: MISSING }, 'stageId'],
      [{ templateId: MISSING }, 'templateId'],
    ] as const) {
      const res = await createTaskAs('mentor', student.id, body);
      expect(res.status).toBe(422);
      expect(res.body.error.fields[field]).toBe('مقدار نامعتبر است');
    }
    const after = await getDb()
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.studentId, student.id));
    expect(after.length).toBe(before.length);
  });

  it('a mentor cannot create tasks for a student outside the scope (404); a student gets 403', async () => {
    expect((await createTaskAs('mentor', otherStudent.id, { title: 'x' })).status).toBe(404);
    expect((await createTaskAs('student', student.id, { title: 'x' })).status).toBe(403);
  });
});

describe('bulk tasks (POST /tasks/bulk, F4 Should)', () => {
  it('one out-of-scope student → 422 and no task for anybody (C3)', async () => {
    const mine = await createUser('student', { mentorId: mentor.id });
    const res = await call('POST', '/tasks/bulk', {
      ...as('mentor'),
      body: { studentIds: [mine.id, otherStudent.id], title: 'گروهی' },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.studentIds).toBe('مقدار نامعتبر است');
    const rows = await getDb()
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.studentId, mine.id));
    expect(rows).toHaveLength(0);
  });

  it('creates one task per student with a shared batch id; reviewer = each primary mentor', async () => {
    const a = await createUser('student', { mentorId: mentor.id });
    const b = await createUser('student', { mentorId: otherMentor.id });
    const res = await call('POST', '/tasks/bulk', {
      ...as('admin'),
      body: { studentIds: [a.id, b.id, a.id], templateId: SEEDED.taskTemplates[0] },
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    const rows = await getDb()
      .select({ studentId: tasks.studentId, reviewerId: tasks.reviewerId, batchId: tasks.batchId })
      .from(tasks)
      .where(eq(tasks.batchId, res.body.batchId));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.studentId === a.id)?.reviewerId).toBe(mentor.id);
    expect(rows.find((r) => r.studentId === b.id)?.reviewerId).toBe(otherMentor.id);
  });
});

describe('the status cycle through the API (F4, data-model.md 3-1)', () => {
  it('open → in_progress → submitted → changes_requested → submitted v2 → accepted', async () => {
    const created = await createTaskAs('mentor', student.id, {
      title: 'نوشتن تیتر',
      dueDate: dayFromToday(2),
    });
    const id = created.body.id as string;

    const started = await call('POST', '/tasks/[id]/start', { ...as('student'), params: { id } });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('in_progress');
    expect(
      (await call('POST', '/tasks/[id]/start', { ...as('student'), params: { id } })).status,
    ).toBe(409);

    const v1 = await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id },
      body: { bodyText: 'نسخه‌ی اول', links: [{ url: 'https://example.com/a', label: 'نمونه' }] },
    });
    expect(v1.status).toBe(201);
    expect(v1.body).toMatchObject({ version: 1, task: { id, status: 'submitted' } });
    // Submitted twice in a row → 409.
    const again = await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id },
      body: { bodyText: 'x' },
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');

    const changes = await call('POST', '/submissions/[id]/review', {
      ...as('mentor'),
      params: { id: v1.body.id },
      body: { outcome: 'changes_requested', feedbackText: 'جمله‌ی اول را کوتاه کن.', score: 3 },
    });
    expect(changes.status).toBe(201);
    expect(changes.body.status).toBe('changes_requested');
    expect(changes.body.revisionCount).toBe(1);
    expect(changes.body.submissions[0].review.outcome).toBe('changes_requested');

    const v2 = await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id },
      body: { bodyText: 'نسخه‌ی دوم' },
    });
    expect(v2.body.version).toBe(2);

    // Only the latest version can be reviewed.
    const old = await call('POST', '/submissions/[id]/review', {
      ...as('mentor'),
      params: { id: v1.body.id },
      body: { outcome: 'accepted', feedbackText: 'x' },
    });
    expect(old.status).toBe(409);

    const accepted = await call('POST', '/submissions/[id]/review', {
      ...as('admin'),
      params: { id: v2.body.id },
      body: { outcome: 'accepted', feedbackText: 'عالی شد.' },
    });
    expect(accepted.body.status).toBe('accepted');
    expect(accepted.body.closedAt).not.toBeNull();
    expect(accepted.body.revisionCount).toBe(1);
    expect(accepted.body.submissions.map((s: { version: number }) => s.version)).toEqual([2, 1]);

    const late = await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id },
      body: { bodyText: 'x' },
    });
    expect(late.status).toBe(409);
    expect(late.body.error.message).toBe('این کار قبلاً تأیید شده است.');
    const cancel = await call('POST', '/tasks/[id]/cancel', {
      ...as('mentor'),
      params: { id },
      body: { reason: 'دیگر لازم نیست' },
    });
    expect(cancel.status).toBe(409);

    const types = (
      await getDb()
        .select({ type: timelineEvents.type, data: timelineEvents.data })
        .from(timelineEvents)
        .where(and(eq(timelineEvents.studentId, student.id), eq(timelineEvents.subjectId, id)))
    ).map((e) => e.type);
    expect(types).toContain('task.created');
    expect(types.filter((t) => t === 'task.status_changed')).toHaveLength(5);
  });

  it('a checkbox task is accepted as soon as the student ticks it', async () => {
    const id = await taskFixture(student.id, mentor.id, { submissionType: 'checkbox' });
    const res = await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id },
      body: {},
    });
    expect(res.status).toBe(201);
    expect(res.body.task.status).toBe('accepted');
  });

  it('proposal_review: separate fields, consent off by default; English text kept as typed', async () => {
    const id = await taskFixture(student.id, mentor.id, { submissionType: 'proposal_review' });
    const missing = await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id },
      body: { bodyText: 'x' },
    });
    expect(missing.status).toBe(422);
    expect(Object.keys(missing.body.error.fields).sort()).toEqual([
      'jobPostText',
      'platformId',
      'proposalText',
    ]);
    const proposal = '  Hi,\n\nI noticed   your store…  ';
    const ok = await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id },
      body: {
        platformId: SEEDED.platforms.upwork,
        jobPostText: 'We need a Shopify developer.',
        proposalText: proposal,
        aiUseConsent: true,
      },
    });
    expect(ok.status).toBe(201);
    const [row] = await getDb()
      .select({
        consent: submissions.aiUseConsent,
        consentAt: submissions.aiUseConsentAt,
        proposal: submissions.proposalText,
      })
      .from(submissions)
      .where(eq(submissions.id, ok.body.id));
    expect(row?.consent).toBe(true);
    expect(row?.consentAt).not.toBeNull();
    expect(row?.proposal).toBe(proposal.trim());

    const second = await taskFixture(student.id, mentor.id, { submissionType: 'proposal_review' });
    const noConsent = await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id: second },
      body: { platformId: SEEDED.platforms.upwork, jobPostText: 'job', proposalText: 'p' },
    });
    const [plain] = await getDb()
      .select({ consent: submissions.aiUseConsent })
      .from(submissions)
      .where(eq(submissions.id, noConsent.body.id));
    expect(plain?.consent).toBe(false);
  });

  it('profile_review on a task with a profile writes a snapshot of THAT profile', async () => {
    const [profile] = await getDb()
      .insert(platformProfiles)
      .values({
        studentId: student.id,
        platformId: SEEDED.platforms.fiverr,
        kind: 'gig',
        headline: 'Logo design',
        createdBy: student.id,
      })
      .returning({ id: platformProfiles.id });
    const created = await createTaskAs('mentor', student.id, {
      title: 'متن گیگ',
      submissionType: 'profile_review',
      profileId: profile?.id,
    });
    expect(created.body.profile.id).toBe(profile?.id);
    const sub = await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id: created.body.id },
      body: { profileText: 'I design logos for coffee shops.' },
    });
    expect(sub.status).toBe(201);
    const snaps = await getDb()
      .select({ body: profileSnapshots.bodyText, source: profileSnapshots.sourceSubmissionId })
      .from(profileSnapshots)
      .where(eq(profileSnapshots.profileId, profile?.id ?? ''));
    expect(snaps).toEqual([{ body: 'I design logos for coffee shops.', source: sub.body.id }]);
  });

  it('extend: later date + reason, counter + history; earlier date → 422; final → 409', async () => {
    const id = await taskFixture(student.id, mentor.id);
    const noReason = await call('POST', '/tasks/[id]/extend', {
      ...as('mentor'),
      params: { id },
      body: { newDueDate: dayFromToday(10) },
    });
    expect(noReason.status).toBe(422);
    const earlier = await call('POST', '/tasks/[id]/extend', {
      ...as('mentor'),
      params: { id },
      body: { newDueDate: dayFromToday(1), reason: 'x' },
    });
    expect(earlier.status).toBe(422);
    const res = await call('POST', '/tasks/[id]/extend', {
      ...as('mentor'),
      params: { id },
      body: { newDueDate: dayFromToday(10), reason: 'سفر کاری' },
    });
    expect(res.status).toBe(200);
    expect(res.body.extensionCount).toBe(1);
    expect(res.body.dueAt).toBe(tehranDayEnd(dayFromToday(10)).toISOString());
    expect(res.body.originalDueAt).toBe(tehranDayEnd(dayFromToday(3)).toISOString());
    const detail = await call('GET', '/tasks/[id]', { ...as('mentor'), params: { id } });
    expect(detail.body.extensions).toHaveLength(1);
    expect(detail.body.extensions[0]).toMatchObject({
      reason: 'سفر کاری',
      actor: { id: mentor.id },
    });

    const done = await taskFixture(student.id, mentor.id, { status: 'accepted' });
    const final = await call('POST', '/tasks/[id]/extend', {
      ...as('mentor'),
      params: { id: done },
      body: { newDueDate: dayFromToday(10), reason: 'x' },
    });
    expect(final.status).toBe(409);
  });

  it('cancel needs a reason; the student never sees it', async () => {
    const id = await taskFixture(student.id, mentor.id);
    expect(
      (await call('POST', '/tasks/[id]/cancel', { ...as('mentor'), params: { id }, body: {} }))
        .status,
    ).toBe(422);
    const res = await call('POST', '/tasks/[id]/cancel', {
      ...as('mentor'),
      params: { id },
      body: { reason: 'CANARY-CANCEL-91' },
    });
    expect(res.body).toMatchObject({ status: 'cancelled', cancelReason: 'CANARY-CANCEL-91' });
    const own = await call('GET', '/tasks/[id]', { ...as('student'), params: { id } });
    expect(own.status).toBe(200);
    expect(JSON.stringify(own.body)).not.toContain('CANARY-CANCEL-91');
    const list = await call('GET', '/me/tasks', { ...as('student') });
    expect(list.body.map((t: { id: string }) => t.id)).not.toContain(id);
    const withCancelled = await call('GET', '/me/tasks', {
      ...as('student'),
      query: { status: 'cancelled' },
    });
    expect(withCancelled.body.map((t: { id: string }) => t.id)).toContain(id);
  });
});

describe('student view (T-DTO, SEC-A5) and scope', () => {
  it('/me/tasks and GET /tasks/:id return only the strict student shapes', async () => {
    const { taskId } = await reviewFixture(student.id, mentor.id, {
      feedbackText: 'بازخورد برای هنرجو',
    });
    const list = await call('GET', '/me/tasks', { ...as('student') });
    expect(list.status).toBe(200);
    for (const item of list.body) studentListItemSchema.parse(item);
    const detail = await call('GET', '/tasks/[id]', { ...as('student'), params: { id: taskId } });
    const parsed = studentTaskSchema.parse(detail.body);
    expect(parsed.submissions[0]?.review?.feedbackText).toBe('بازخورد برای هنرجو');
    expect(parsed.submissions[0]?.review?.reviewer).toEqual({ displayName: mentor.displayName });
    for (const forbidden of ['reviewerId', 'revisionCount', 'extensionCount', 'createdBy']) {
      expect(JSON.stringify(detail.body)).not.toContain(`"${forbidden}"`);
    }
    expect(JSON.stringify(detail.body)).not.toContain(mentor.id);
  });

  it('S-other and M-other get the same 404 as a missing id', async () => {
    const id = await taskFixture(student.id, mentor.id);
    for (const [who, method, path, body] of [
      ['otherStudent', 'GET', '/tasks/[id]', undefined],
      ['otherStudent', 'POST', '/tasks/[id]/submissions', { bodyText: 'x' }],
      ['otherStudent', 'POST', '/tasks/[id]/start', undefined],
      ['otherMentor', 'GET', '/tasks/[id]', undefined],
      ['otherMentor', 'PATCH', '/tasks/[id]', { title: 'x' }],
      ['otherMentor', 'POST', '/tasks/[id]/cancel', { reason: 'x' }],
    ] as const) {
      const missing = await call(method, path, { ...as(who), params: { id: MISSING }, body });
      const res = await call(method, path, { ...as(who), params: { id }, body });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(missing.body);
    }
  });

  it('reviews: other mentor 404; a mentor in scope who is not the reviewer cannot edit; 24 h window', async () => {
    const { submissionId } = await submittedTaskFixture(student.id, mentor.id);
    expect(
      (
        await call('POST', '/submissions/[id]/review', {
          ...as('otherMentor'),
          params: { id: submissionId },
          body: { outcome: 'accepted', feedbackText: 'x' },
        })
      ).status,
    ).toBe(404);

    const { reviewId } = await reviewFixture(student.id, admin.id);
    // mentor is in scope but not the reviewer → 404; the admin may edit.
    expect(
      (
        await call('PATCH', '/reviews/[id]', {
          ...as('mentor'),
          params: { id: reviewId },
          body: { score: 4 },
        })
      ).status,
    ).toBe(404);
    const edited = await call('PATCH', '/reviews/[id]', {
      ...as('admin'),
      params: { id: reviewId },
      body: { feedbackText: 'متن اصلاح‌شده', score: 4 },
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      feedbackText: 'متن اصلاح‌شده',
      score: 4,
      outcome: 'changes_requested',
    });

    const old = await reviewFixture(student.id, mentor.id, {
      createdAt: new Date(Date.now() - 25 * 3600_000),
    });
    const late = await call('PATCH', '/reviews/[id]', {
      ...as('mentor'),
      params: { id: old.reviewId },
      body: { score: 2 },
    });
    expect(late.status).toBe(409);
    // The outcome is not editable at all.
    expect(
      (
        await call('PATCH', '/reviews/[id]', {
          ...as('mentor'),
          params: { id: old.reviewId },
          body: { outcome: 'accepted' },
        })
      ).status,
    ).toBe(422);
  });
});

describe('counters, review queue and suggested templates', () => {
  it('student list and record show open / overdue counts and the next task', async () => {
    const fresh = await createUser('student', { mentorId: mentor.id });
    const lateId = await taskFixture(fresh.id, mentor.id, {
      title: 'عقب‌افتاده',
      dueAt: tehranDayEnd(dayFromToday(-3)),
    });
    await taskFixture(fresh.id, mentor.id, { title: 'بعدی' });
    await taskFixture(fresh.id, mentor.id, { status: 'submitted' });
    await taskFixture(fresh.id, mentor.id, { status: 'accepted' });
    const record = await call('GET', '/students/[id]', {
      ...as('mentor'),
      params: { id: fresh.id },
    });
    expect(record.body).toMatchObject({ openTaskCount: 3, overdueTaskCount: 1 });
    expect(record.body.nextTask).toMatchObject({ id: lateId, overdue: true });
    const list = await call('GET', '/students', { ...as('mentor') });
    const row = list.body.items.find((s: { id: string }) => s.id === fresh.id);
    expect(row).toMatchObject({ openTaskCount: 3, overdueTaskCount: 1 });
    const summary = await call('GET', '/students/[id]/summary', {
      ...as('mentor'),
      params: { id: fresh.id },
    });
    expect(summary.body.openTasks).toHaveLength(3);

    const mine = await call('GET', '/me/tasks', { cookies: (await loginAs(fresh)).cookies });
    expect(mine.body[0]).toMatchObject({ id: lateId, overdue: true });
    expect(mine.body[0].overdueDays).toBe(3);
  });

  it('review queue: scope only, oldest first, SLA fields', async () => {
    const old = await submittedTaskFixture(student.id, mentor.id, {
      submittedAt: new Date(Date.now() - 10 * 24 * 3600_000),
    });
    const foreign = await submittedTaskFixture(otherStudent.id, otherMentor.id);
    const queue = await call('GET', '/review-queue', { ...as('mentor') });
    expect(queue.status).toBe(200);
    const ids = queue.body.map((r: { taskId: string }) => r.taskId);
    expect(ids).toContain(old.taskId);
    expect(ids).not.toContain(foreign.taskId);
    const item = queue.body.find((r: { taskId: string }) => r.taskId === old.taskId);
    // A non-gate task: `sla.reviewHoursNonGate` (72), followup F-09.
    expect(item).toMatchObject({ slaHours: 72, breached: true, version: 1 });
    expect(item.slaRemainingHours).toBeLessThan(0);
    const adminQueue = await call('GET', '/review-queue', {
      ...as('admin'),
      query: { mentorId: otherMentor.id },
    });
    const adminIds = adminQueue.body.map((r: { taskId: string }) => r.taskId);
    expect(adminIds).toContain(foreign.taskId);
    expect(adminIds).not.toContain(old.taskId);
  });

  it('a stage change returns the templates suggested for the new stage (F3 Should)', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const res = await call('PUT', '/students/[id]/stage', {
      ...as('mentor'),
      params: { id: s.id },
      body: { toStageId: SEEDED.stages[1], kind: 'advance' },
    });
    expect(res.status).toBe(200);
    expect(res.body.suggestedTemplates.map((t: { id: string }) => t.id)).toEqual([
      SEEDED.taskTemplates[3],
    ]);
    // Suggested only: nothing created.
    const rows = await getDb()
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.studentId, s.id));
    expect(rows).toHaveLength(0);
  });

  it('task templates: mentors read, only admins write', async () => {
    const list = await call('GET', '/task-templates', {
      ...as('mentor'),
      query: { stageId: SEEDED.stages[0] ?? '' },
    });
    expect(list.body).toHaveLength(3);
    expect(
      (await call('POST', '/task-templates', { ...as('mentor'), body: { title: 'x' } })).status,
    ).toBe(403);
    const created = await call('POST', '/task-templates', {
      ...as('admin'),
      body: { title: 'قالب تازه', stageId: SEEDED.stages[4], defaultDueDays: '۵' },
    });
    expect(created.status).toBe(201);
    expect(created.body.defaultDueDays).toBe(5);
    const off = await call('PATCH', '/task-templates/[id]', {
      ...as('admin'),
      params: { id: created.body.id },
      body: { isActive: false },
    });
    expect(off.body.isActive).toBe(false);
    // An inactive template is an invalid reference (T-REF).
    expect((await createTaskAs('admin', student.id, { templateId: created.body.id })).status).toBe(
      422,
    );
  });
});
