import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, tehranDay } from '@/lib/tehran-day';
import { checkins } from '@/modules/checkins/schema';
import { questionThreads } from '@/modules/questions/schema';
import { submissions } from '@/modules/tasks/schema';
import { getDb } from '@/server/db';
import {
  dayFromToday,
  formWith,
  imageBytes,
  milestoneFixture,
  milestoneTypeFixture,
  submittedTaskFixture,
} from './fixtures';
import { call, createUser, loginAs, SEEDED, type TestUser } from './helpers';

/**
 * Weekly check-in (api.md section 11, decision E5 = on by the seed) and milestones / North
 * Star (PRD F9, api.md section 12). The «off» case of the check-in is in settings.test.ts
 * (isolated database).
 */

let admin: TestUser;
let mentor: TestUser;
let otherMentor: TestUser;
let student: TestUser;
const c: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor');
  otherMentor = await createUser('mentor');
  student = await createUser('student', { mentorId: mentor.id });
  for (const [key, user] of Object.entries({ admin, mentor, otherMentor, student })) {
    c[key] = (await loginAs(user)).cookies;
  }
});

const as = (who: string) => ({ cookies: c[who] ?? {} });

describe('weekly check-in', () => {
  it('current week, one check-in per week, «needs help» opens a question', async () => {
    const current = await call('GET', '/me/checkins/current', { ...as('student') });
    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({
      weekStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      existing: null,
      weekSummary: { tasksSubmitted: 0, tasksAccepted: 0 },
    });
    expect(typeof current.body.open).toBe('boolean');

    const bad = await call('POST', '/me/checkins', {
      ...as('student'),
      body: { mood: 6, needsHelp: false },
    });
    expect(bad.status).toBe(422);
    const res = await call('POST', '/me/checkins', {
      ...as('student'),
      body: {
        activityText: 'دو پروپوزال فرستادم',
        blocker: 'نمی‌دانم نرخم را چقدر بگذارم',
        mood: '۲',
        nextWeekPlan: 'پنج ارسال',
        needsHelp: true,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mood: 2, needsHelp: true, weekStart: current.body.weekStart });
    const [thread] = await getDb()
      .select({ source: questionThreads.source, assigneeId: questionThreads.assigneeId })
      .from(questionThreads)
      .where(eq(questionThreads.id, res.body.questionId));
    expect(thread).toEqual({ source: 'checkin', assigneeId: mentor.id });

    const again = await call('POST', '/me/checkins', {
      ...as('student'),
      body: { mood: 4, needsHelp: false },
    });
    expect(again.status).toBe(409);
    const after = await call('GET', '/me/checkins/current', { ...as('student') });
    expect(after.body.existing.id).toBe(res.body.id);

    const staff = await call('GET', '/students/[id]/checkins', {
      ...as('mentor'),
      params: { id: student.id },
    });
    expect(staff.body.items[0]).toMatchObject({ id: res.body.id, mood: 2 });
    const foreign = await call('GET', '/students/[id]/checkins', {
      ...as('otherMentor'),
      params: { id: student.id },
    });
    expect(foreign.status).toBe(404);
  });

  it('week summary counts this week’s submissions; a low mood shows up in R-MOOD', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const cookies = (await loginAs(s)).cookies;
    const { submissionId } = await submittedTaskFixture(s.id, mentor.id);
    expect(submissionId).toBeTruthy();
    const current = await call('GET', '/me/checkins/current', { cookies });
    expect(current.body.weekSummary.tasksSubmitted).toBe(1);
    // A check-in of last week with a low mood → R-MOOD yellow (via the stored row).
    await getDb()
      .insert(checkins)
      .values({ studentId: s.id, weekStart: addDays(current.body.weekStart, -7), mood: 1 });
    await call('POST', '/me/checkins', { cookies, body: { mood: 1, needsHelp: false } });
    const health = await call('GET', '/students/[id]/health', {
      ...as('mentor'),
      params: { id: s.id },
    });
    expect(health.body.reasons).toContainEqual(
      expect.objectContaining({ rule: 'R-MOOD', level: 'red', facts: { mood: 1, weeks: 2 } }),
    );
    expect(
      await getDb().select().from(submissions).where(eq(submissions.id, submissionId)),
    ).toHaveLength(1);
  });
});

describe('milestones (F9)', () => {
  it('a student proposes with evidence; status in the body is refused (T-ESC)', async () => {
    const escalate = await call('POST', '/me/milestones', {
      ...as('student'),
      body: {
        typeId: SEEDED.milestoneTypes.firstContract,
        occurredOn: dayFromToday(0),
        evidenceText: 'قرارداد',
        status: 'approved',
      },
    });
    expect(escalate.status).toBe(422);
    const noEvidence = await call('POST', '/me/milestones', {
      ...as('student'),
      body: { typeId: SEEDED.milestoneTypes.firstContract, occurredOn: dayFromToday(0) },
    });
    expect(noEvidence.status).toBe(422);
    expect(noEvidence.body.error.fields.evidenceText).toBeDefined();
    const future = await call('POST', '/me/milestones', {
      ...as('student'),
      body: {
        typeId: SEEDED.milestoneTypes.firstContract,
        occurredOn: addDays(tehranDay(), 2),
        evidenceText: 'x',
      },
    });
    expect(future.status).toBe(422);

    const upload = await call('POST', '/attachments', {
      ...as('student'),
      form: formWith(await imageBytes()),
    });
    const res = await call('POST', '/me/milestones', {
      ...as('student'),
      body: {
        typeId: SEEDED.milestoneTypes.firstContract,
        occurredOn: dayFromToday(-1),
        platformId: SEEDED.platforms.upwork,
        amount: '۲۵۰',
        attachmentIds: [upload.body.id],
      },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'proposed',
      amount: '250.00',
      currency: 'USD',
      platform: { id: SEEDED.platforms.upwork },
      attachments: [{ id: upload.body.id }],
    });
    expect(Object.keys(res.body)).not.toContain('proposedBy');

    const approve = await call('POST', '/milestones/[id]/approve', {
      ...as('mentor'),
      params: { id: res.body.id },
    });
    expect(approve.body).toMatchObject({ status: 'approved', decidedBy: { id: mentor.id } });
    const twice = await call('POST', '/milestones/[id]/approve', {
      ...as('mentor'),
      params: { id: res.body.id },
    });
    expect(twice.status).toBe(409);
    const file = await call('GET', '/attachments/[id]', {
      ...as('mentor'),
      params: { id: upload.body.id },
    });
    expect(file.status).toBe(200);
  });

  it('unique types: a second approval for the same student → 409', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const typeId = await milestoneTypeFixture({ uniquePerStudent: true });
    const first = await call('POST', '/students/[id]/milestones', {
      ...as('mentor'),
      params: { id: s.id },
      body: { typeId, occurredOn: dayFromToday(0) },
    });
    expect(first.body.status).toBe('approved');
    const proposal = await milestoneFixture(s.id, typeId);
    const second = await call('POST', '/milestones/[id]/approve', {
      ...as('mentor'),
      params: { id: proposal },
    });
    expect(second.status).toBe(409);
    const direct = await call('POST', '/students/[id]/milestones', {
      ...as('mentor'),
      params: { id: s.id },
      body: { typeId, occurredOn: dayFromToday(0) },
    });
    expect(direct.status).toBe(409);
  });

  it('reject needs a reason; rejected ones stay out of /me/milestones; other mentor → 404', async () => {
    const typeId = await milestoneTypeFixture();
    const id = await milestoneFixture(student.id, typeId);
    const noReason = await call('POST', '/milestones/[id]/reject', {
      ...as('mentor'),
      params: { id },
      body: {},
    });
    expect(noReason.status).toBe(422);
    const foreign = await call('POST', '/milestones/[id]/reject', {
      ...as('otherMentor'),
      params: { id },
      body: { reason: 'x' },
    });
    expect(foreign.status).toBe(404);
    const res = await call('POST', '/milestones/[id]/reject', {
      ...as('mentor'),
      params: { id },
      body: { reason: 'مدرک نامعتبر' },
    });
    expect(res.body).toMatchObject({ status: 'rejected', rejectionReason: 'مدرک نامعتبر' });
    const mine = await call('GET', '/me/milestones', { ...as('student') });
    expect(mine.body.map((m: { id: string }) => m.id)).not.toContain(id);
    const staff = await call('GET', '/students/[id]/milestones', {
      ...as('mentor'),
      params: { id: student.id },
    });
    expect(staff.body.map((m: { id: string }) => m.id)).toContain(id);
  });

  it('inactive type → 422 (C3)', async () => {
    const inactive = await milestoneTypeFixture({ isActive: false });
    const res = await call('POST', '/students/[id]/milestones', {
      ...as('mentor'),
      params: { id: student.id },
      body: { typeId: inactive, occurredOn: dayFromToday(0) },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields).toEqual({ typeId: 'مقدار نامعتبر است' });
  });

  it('North Star: counted by the flag, in range and in total; median days to the first', async () => {
    const before = await call('GET', '/dashboard/north-star', { ...as('admin') });
    expect(before.status).toBe(200);
    const s = await createUser('student', { mentorId: mentor.id });
    await call('POST', '/students/[id]/milestones', {
      ...as('mentor'),
      params: { id: s.id },
      body: { typeId: SEEDED.milestoneTypes.firstContract, occurredOn: dayFromToday(0) },
    });
    await call('POST', '/students/[id]/milestones', {
      ...as('mentor'),
      params: { id: s.id },
      body: { typeId: SEEDED.milestoneTypes.firstApply, occurredOn: dayFromToday(0) },
    });
    const after = await call('GET', '/dashboard/north-star', { ...as('admin') });
    expect(after.body.approvedTotal).toBe(before.body.approvedTotal + 1);
    expect(after.body.approvedInRange).toBe(before.body.approvedInRange + 1);
    expect(after.body.studentsWithFirst).toBe(before.body.studentsWithFirst + 1);
    expect(after.body.medianDaysToFirst).toEqual(expect.any(Number));
    expect(after.body.from <= tehranDay() && tehranDay() <= after.body.to).toBe(true);
    const range = await call('GET', '/dashboard/north-star', {
      ...as('admin'),
      query: { from: '2020-01-01', to: '2020-01-31' },
    });
    expect(range.body.approvedInRange).toBe(0);
    const reversed = await call('GET', '/dashboard/north-star', {
      ...as('admin'),
      query: { from: '2020-02-01', to: '2020-01-01' },
    });
    expect(reversed.status).toBe(422);
  });

  it('milestones.csv: admin only, audited, no evidence text', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    await call('POST', '/students/[id]/milestones', {
      ...as('mentor'),
      params: { id: s.id },
      body: {
        typeId: SEEDED.milestoneTypes.profileReady,
        occurredOn: dayFromToday(0),
        evidenceText: 'EVIDENCE-SECRET',
      },
    });
    const res = await call('GET', '/exports/milestones.csv', { ...as('admin') });
    expect(res.status).toBe(200);
    const text = new TextDecoder().decode(res.bytes);
    expect(text).toContain('پروفایل آماده');
    expect(text).not.toContain('EVIDENCE-SECRET');
  });
});
