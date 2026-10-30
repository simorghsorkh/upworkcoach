import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, tehranDateTime, tehranDay } from '@/lib/tehran-day';
import { reminders } from '@/modules/reminders/schema';
import { getDb } from '@/server/db';
import { dayFromToday, reminderFixture, submittedTaskFixture } from './fixtures';
import { call, createUser, loginAs, type TestUser } from './helpers';

/** Reminders and "Today" (PRD F6, api.md section 8, ADR-0004 table). */

const MISSING = '01900000-0000-7000-8000-00000000d00d';

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
  for (const [key, user] of Object.entries({ admin, mentor, otherMentor, student })) {
    c[key] = (await loginAs(user)).cookies;
  }
});

const as = (who: string) => ({ cookies: c[who] });
const ids = (list: Array<{ id: string }>) => list.map((r) => r.id);

describe('reminders', () => {
  it('a day means 09:00 Tehran; owner defaults to the actor', async () => {
    const day = dayFromToday(2);
    const res = await call('POST', '/reminders', {
      ...as('mentor'),
      body: { text: 'پنجشنبه پیگیری پروفایل Fiverr', dueDate: day, studentId: student.id },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      dueAt: tehranDateTime(day, 9).toISOString(),
      owner: { id: mentor.id },
      student: { id: student.id },
      status: 'open',
      source: 'manual',
      overdue: false,
    });
    const upcoming = await call('GET', '/reminders', {
      ...as('mentor'),
      query: { scope: 'upcoming' },
    });
    expect(ids(upcoming.body)).toContain(res.body.id);
    const today = await call('GET', '/reminders', { ...as('mentor') });
    expect(ids(today.body)).not.toContain(res.body.id);
  });

  it('T-REF: mentor for someone else, student out of scope, a student as owner → 422', async () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['mentor', { ownerId: otherMentor.id }, 'ownerId'],
      ['mentor', { studentId: otherStudent.id }, 'studentId'],
      ['admin', { ownerId: student.id }, 'ownerId'],
      ['admin', { studentId: MISSING }, 'studentId'],
    ];
    for (const [who, extra, field] of cases) {
      const res = await call('POST', '/reminders', {
        ...as(who),
        body: { text: 'x', dueDate: dayFromToday(1), ...extra },
      });
      expect(res.status).toBe(422);
      expect(res.body.error.fields[field]).toBe('مقدار نامعتبر است');
    }
    const forMentor = await call('POST', '/reminders', {
      ...as('admin'),
      body: { text: 'برای مشاور', dueDate: dayFromToday(1), ownerId: otherMentor.id },
    });
    expect(forMentor.body.owner.id).toBe(otherMentor.id);
  });

  it('done, snooze (1/3/7) and cancel; only owner or admin, others 404', async () => {
    const past = new Date(Date.now() - 2 * 3600_000);
    const id = await reminderFixture(mentor.id, { studentId: student.id, dueAt: past });
    const today = await call('GET', '/reminders', { ...as('mentor') });
    const row = today.body.find((r: { id: string }) => r.id === id);
    expect(row.overdue).toBe(true);

    for (const [method, path, body] of [
      ['PATCH', '/reminders/[id]', { text: 'x' }],
      ['POST', '/reminders/[id]/done', undefined],
      ['POST', '/reminders/[id]/snooze', { days: 1 }],
      ['DELETE', '/reminders/[id]', undefined],
    ] as const) {
      const missing = await call(method, path, {
        ...as('otherMentor'),
        params: { id: MISSING },
        body,
      });
      const res = await call(method, path, { ...as('otherMentor'), params: { id }, body });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(missing.body);
    }

    expect(
      (
        await call('POST', '/reminders/[id]/snooze', {
          ...as('mentor'),
          params: { id },
          body: { days: 2 },
        })
      ).status,
    ).toBe(422);
    const snoozed = await call('POST', '/reminders/[id]/snooze', {
      ...as('mentor'),
      params: { id },
      body: { days: 3 },
    });
    expect(snoozed.body.snoozeCount).toBe(1);
    const dueMs = Date.parse(snoozed.body.dueAt);
    expect(dueMs - Date.now()).toBeGreaterThan(3 * 24 * 3600_000 - 60_000);
    expect(dueMs - Date.now()).toBeLessThan(3 * 24 * 3600_000 + 60_000);

    const done = await call('POST', '/reminders/[id]/done', { ...as('admin'), params: { id } });
    expect(done.body.status).toBe('done');
    expect(done.body.doneAt).not.toBeNull();
    const doneList = await call('GET', '/reminders', { ...as('mentor'), query: { scope: 'done' } });
    expect(ids(doneList.body)).toContain(id);
    // Done twice is fine; snoozing a done reminder is not.
    expect(
      (await call('POST', '/reminders/[id]/done', { ...as('mentor'), params: { id } })).status,
    ).toBe(200);
    expect(
      (
        await call('POST', '/reminders/[id]/snooze', {
          ...as('mentor'),
          params: { id },
          body: { days: 1 },
        })
      ).status,
    ).toBe(409);

    const other = await reminderFixture(mentor.id);
    expect(
      (await call('DELETE', '/reminders/[id]', { ...as('mentor'), params: { id: other } })).status,
    ).toBe(204);
    const [cancelled] = await getDb()
      .select({ status: reminders.status })
      .from(reminders)
      .where(eq(reminders.id, other));
    expect(cancelled?.status).toBe('cancelled');
  });

  it('a mentor sees only own reminders; the admin filters by owner', async () => {
    const theirs = await reminderFixture(otherMentor.id);
    const mine = await reminderFixture(mentor.id);
    const list = await call('GET', '/reminders', { ...as('mentor') });
    expect(ids(list.body)).toContain(mine);
    expect(ids(list.body)).not.toContain(theirs);
    const sneaky = await call('GET', '/reminders', {
      ...as('mentor'),
      query: { ownerId: otherMentor.id },
    });
    expect(sneaky.body).toEqual([]);
    const adminView = await call('GET', '/reminders', {
      ...as('admin'),
      query: { ownerId: otherMentor.id },
    });
    expect(ids(adminView.body)).toContain(theirs);
  });

  it('mentor change: open reminders about the student move to the new mentor', async () => {
    const moved = await createUser('student', { mentorId: mentor.id });
    const open = await reminderFixture(mentor.id, { studentId: moved.id });
    const unrelated = await reminderFixture(mentor.id);
    await call('PUT', '/students/[id]/mentor', {
      ...as('admin'),
      params: { id: moved.id },
      body: { mentorId: otherMentor.id },
    });
    const rows = await getDb()
      .select({ id: reminders.id, owner: reminders.ownerId })
      .from(reminders)
      .where(eq(reminders.ownerId, otherMentor.id));
    expect(ids(rows)).toContain(open);
    expect(ids(rows)).not.toContain(unrelated);
  });

  it('pause → system reminder one day before the return; back to active → cancelled', async () => {
    const paused = await createUser('student', { mentorId: mentor.id });
    const until = addDays(tehranDay(), 10);
    const res = await call('PUT', '/students/[id]/lifecycle', {
      ...as('admin'),
      params: { id: paused.id },
      body: { status: 'paused', pausedUntil: until },
    });
    expect(res.status).toBe(200);
    const key = `pause-return:${paused.id}:${until}`;
    const [row] = await getDb()
      .select({
        owner: reminders.ownerId,
        dueAt: reminders.dueAt,
        status: reminders.status,
        source: reminders.source,
      })
      .from(reminders)
      .where(eq(reminders.systemKey, key));
    expect(row).toEqual({
      owner: mentor.id,
      dueAt: tehranDateTime(addDays(until, -1), 9),
      status: 'open',
      source: 'system',
    });
    // Same pause again: still one reminder.
    await call('PUT', '/students/[id]/lifecycle', {
      ...as('admin'),
      params: { id: paused.id },
      body: { status: 'paused', pausedUntil: until },
    });
    const again = await getDb()
      .select({ id: reminders.id })
      .from(reminders)
      .where(eq(reminders.studentId, paused.id));
    expect(again).toHaveLength(1);
    await call('PUT', '/students/[id]/lifecycle', {
      ...as('admin'),
      params: { id: paused.id },
      body: { status: 'active' },
    });
    const [after] = await getDb()
      .select({ status: reminders.status })
      .from(reminders)
      .where(and(eq(reminders.systemKey, key)));
    expect(after?.status).toBe('cancelled');
  });
});

describe('«امروز» (GET /today)', () => {
  it('reminders of today and before, the review queue with SLA, empty sprint-4 sections', async () => {
    const mineToday = await reminderFixture(mentor.id, { studentId: student.id });
    const mineTomorrow = await reminderFixture(mentor.id, {
      dueAt: tehranDateTime(dayFromToday(1), 9),
    });
    const theirs = await reminderFixture(otherMentor.id);
    const review = await submittedTaskFixture(student.id, mentor.id, {
      submittedAt: new Date(Date.now() - 14 * 24 * 3600_000),
    });
    const foreignReview = await submittedTaskFixture(otherStudent.id, otherMentor.id);

    const res = await call('GET', '/today', { ...as('mentor') });
    expect(res.status).toBe(200);
    expect(ids(res.body.reminders)).toContain(mineToday);
    expect(ids(res.body.reminders)).not.toContain(mineTomorrow);
    expect(ids(res.body.reminders)).not.toContain(theirs);
    const queue = res.body.reviewQueue.map((r: { taskId: string }) => r.taskId);
    expect(queue).toContain(review.taskId);
    expect(queue).not.toContain(foreignReview.taskId);
    expect(res.body.unansweredQuestions).toEqual([]);
    expect(res.body.stuckStudents).toEqual([]);
    const waiting = res.body.waitingOnUs.find((w: { refId: string }) => w.refId === review.taskId);
    expect(waiting).toMatchObject({
      kind: 'review',
      studentId: student.id,
      breached: true,
      // A non-gate task: `sla.reviewHoursNonGate` (72), followup F-09.
      slaHours: 72,
    });
    expect(res.body.counts.reviews).toBe(res.body.reviewQueue.length);
    expect(res.body.counts.breachedReviews).toBeGreaterThanOrEqual(1);

    const adminAll = await call('GET', '/today', { ...as('admin') });
    expect(ids(adminAll.body.reminders)).toEqual(expect.arrayContaining([mineToday, theirs]));
    const adminFiltered = await call('GET', '/today', {
      ...as('admin'),
      query: { mentorId: otherMentor.id },
    });
    expect(ids(adminFiltered.body.reminders)).toContain(theirs);
    expect(ids(adminFiltered.body.reminders)).not.toContain(mineToday);
    expect(adminFiltered.body.reviewQueue.map((r: { taskId: string }) => r.taskId)).not.toContain(
      review.taskId,
    );
    expect((await call('GET', '/today', { ...as('student') })).status).toBe(403);
  });
});
