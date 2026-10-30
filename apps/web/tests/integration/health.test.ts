import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, tehranDay } from '@/lib/tehran-day';
import { recomputeHealth, sweepAllHealth } from '@/modules/health/recompute';
import { studentHealth } from '@/modules/health/schema';
import { students } from '@/modules/students/schema';
import { timelineEvents } from '@/modules/timeline/schema';
import { getDb } from '@/server/db';
import { ROUTES } from '@/server/http/routes.manifest';
import { dayFromToday, noteFixture, taskFixture } from './fixtures';
import { call, createUser, loginAs, SEEDED, type TestUser, uniquePhone } from './helpers';

/**
 * Health (PRD F7, ADR-0005, api.md section 9): stored results in the staff DTOs, filters and
 * sort, flags, snooze, paused students, the hourly sweep, "red without action" in "Today",
 * and the canary: nothing about health, reasons or flags reaches the student.
 */

const CANARY = 'CANARY-HEALTH-91c2';
const MISSING = '01900000-0000-7000-8000-00000000beef';
const DAY = 24 * 3600_000;

let admin: TestUser;
let mentor: TestUser;
let otherMentor: TestUser;
const c: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor');
  otherMentor = await createUser('mentor');
  for (const [key, user] of Object.entries({ admin, mentor, otherMentor })) {
    c[key] = (await loginAs(user)).cookies;
  }
});

const as = (who: string) => ({ cookies: c[who] ?? {} });

/** A student of `mentor` whose only task is overdue `days` days (→ R-OVERDUE). */
async function studentWithOverdue(days: number, name = 'هنرجوی سلامت'): Promise<TestUser> {
  const s = await createUser('student', { mentorId: mentor.id, displayName: name });
  await taskFixture(s.id, mentor.id, { dueAt: new Date(Date.now() - days * DAY) });
  await recomputeHealth(getDb(), [s.id]);
  return s;
}

async function healthOf(studentId: string) {
  const res = await call('GET', '/students/[id]/health', {
    ...as('mentor'),
    params: { id: studentId },
  });
  expect(res.status).toBe(200);
  return res.body;
}

describe('health in the staff DTOs (F7)', () => {
  it('a new student gets a computed green health right after POST /students', async () => {
    const res = await call('POST', '/students', {
      ...as('mentor'),
      body: { displayName: 'هنرجوی سبز', phone: uniquePhone() },
    });
    expect(res.status).toBe(201);
    expect(res.body.student.health).toMatchObject({
      status: 'green',
      reasons: [],
      churnRisk: false,
      ball: null,
      snoozedUntil: null,
    });
  });

  it('an overdue task makes the student red with reason, facts and ball in list, record and board', async () => {
    const s = await studentWithOverdue(9);
    const record = await call('GET', '/students/[id]', { ...as('mentor'), params: { id: s.id } });
    expect(record.body.health).toMatchObject({
      status: 'red',
      ball: 'student',
      reasons: [
        {
          rule: 'R-OVERDUE',
          level: 'red',
          ball: 'student',
          facts: { overdueCount: 1, maxOverdueDays: 9 },
        },
      ],
    });
    expect(record.body.stage).toMatchObject({ sortOrder: expect.any(Number), isActive: true });

    const list = await call('GET', '/students', { ...as('mentor'), query: { health: 'red' } });
    const row = list.body.items.find((i: { id: string }) => i.id === s.id);
    expect(row.health.status).toBe('red');
    expect(row.overExpected).toBe('none');
    expect(
      list.body.items.every((i: { health: { status: string } }) => i.health?.status === 'red'),
    ).toBe(true);
    expect(list.body.counts.byHealth.red).toBeGreaterThanOrEqual(1);

    const board = await call('GET', '/board', { ...as('mentor') });
    const card = board.body.columns
      .flatMap((col: { students: Array<{ id: string }> }) => col.students)
      .find((x: { id: string }) => x.id === s.id);
    expect(card).toMatchObject({ accountStatus: 'active', health: { status: 'red' } });
    const redBoard = await call('GET', '/board', { ...as('mentor'), query: { health: 'green' } });
    const ids = redBoard.body.columns.flatMap((col: { students: Array<{ id: string }> }) =>
      col.students.map((x) => x.id),
    );
    expect(ids).not.toContain(s.id);
  });

  it('sort=health puts red first, then yellow, then the oldest status', async () => {
    await studentWithOverdue(10, 'قرمز مرتب');
    const res = await call('GET', '/students', {
      ...as('mentor'),
      query: { sort: 'health', limit: '100' },
    });
    const ranks = res.body.items.map(
      (i: { health: { status: string } | null }) =>
        ({ red: 0, yellow: 1, green: 2, paused: 3, untracked: 4 })[i.health?.status ?? ''] ?? 5,
    );
    expect(ranks).toEqual([...ranks].sort((a: number, b: number) => a - b));
  });

  it('after-commit recompute: cancelling the overdue task clears R-OVERDUE without any job', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const taskId = await taskFixture(s.id, mentor.id, { dueAt: new Date(Date.now() - 9 * DAY) });
    await taskFixture(s.id, mentor.id); // keeps R-NOTASK away
    await recomputeHealth(getDb(), [s.id]);
    expect((await healthOf(s.id)).status).toBe('red');
    const cancel = await call('POST', '/tasks/[id]/cancel', {
      ...as('mentor'),
      params: { id: taskId },
      body: { reason: 'دیگر لازم نیست' },
    });
    expect(cancel.status).toBe(200);
    const after = await healthOf(s.id);
    expect(after.status).toBe('green');
    const events = await getDb()
      .select({ data: timelineEvents.data })
      .from(timelineEvents)
      .where(and(eq(timelineEvents.studentId, s.id), eq(timelineEvents.type, 'health.changed')));
    expect(events.at(-1)?.data).toMatchObject({ from: 'red', to: 'green' });
  });

  it('M-other and a missing id get the same 404 on health and flags', async () => {
    const s = await studentWithOverdue(4);
    for (const path of ['/students/[id]/health', '/students/[id]/flags'] as const) {
      const missing = await call('GET', path, { ...as('otherMentor'), params: { id: MISSING } });
      const foreign = await call('GET', path, { ...as('otherMentor'), params: { id: s.id } });
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
    }
  });
});

describe('flags (R-FLAG)', () => {
  it('a red flag makes the student red; clearing it recomputes', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    await taskFixture(s.id, mentor.id);
    const flag = await call('POST', '/students/[id]/flags', {
      ...as('mentor'),
      params: { id: s.id },
      body: { category: 'financial', level: 'red', note: 'مشکل مالی', expiresAt: dayFromToday(10) },
    });
    expect(flag.status).toBe(201);
    expect(flag.body).toMatchObject({ level: 'red', active: true, createdBy: { id: mentor.id } });
    expect((await healthOf(s.id)).reasons[0]).toMatchObject({ rule: 'R-FLAG', level: 'red' });

    const active = await call('GET', '/students/[id]/flags', {
      ...as('mentor'),
      params: { id: s.id },
      query: { active: '1' },
    });
    expect(active.body).toHaveLength(1);
    const cleared = await call('POST', '/flags/[id]/clear', {
      ...as('mentor'),
      params: { id: flag.body.id },
    });
    expect(cleared.body).toMatchObject({ active: false, clearedBy: { id: mentor.id } });
    expect((await healthOf(s.id)).status).toBe('green');
    const again = await call('GET', '/students/[id]/flags', {
      ...as('mentor'),
      params: { id: s.id },
      query: { active: '1' },
    });
    expect(again.body).toEqual([]);
  });

  it('a past expiry is refused; another mentor cannot clear the flag (404)', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const past = await call('POST', '/students/[id]/flags', {
      ...as('mentor'),
      params: { id: s.id },
      body: {
        category: 'other',
        level: 'yellow',
        expiresAt: new Date(Date.now() - DAY).toISOString(),
      },
    });
    expect(past.status).toBe(422);
    const ok = await call('POST', '/students/[id]/flags', {
      ...as('mentor'),
      params: { id: s.id },
      body: { category: 'other', level: 'yellow' },
    });
    const foreign = await call('POST', '/flags/[id]/clear', {
      ...as('otherMentor'),
      params: { id: ok.body.id },
    });
    expect(foreign.status).toBe(404);
  });
});

describe('stuck list, snooze and paused students (F7)', () => {
  it('snoozed students leave /stuck and «امروز» until the date; includeSnoozed shows them', async () => {
    const s = await studentWithOverdue(9, 'هنرجوی مسافر');
    const inStuck = async (query: Record<string, string> = {}) =>
      (await call('GET', '/stuck', { ...as('mentor'), query })).body.map(
        (i: { id: string }) => i.id,
      );
    expect(await inStuck()).toContain(s.id);
    const today = await call('GET', '/today', { ...as('mentor') });
    expect(today.body.stuckStudents.map((i: { id: string }) => i.id)).toContain(s.id);
    expect(today.body.counts.stuckStudents).toBe(today.body.stuckStudents.length);

    const past = await call('PUT', '/students/[id]/health/snooze', {
      ...as('mentor'),
      params: { id: s.id },
      body: { until: addDays(tehranDay(), -1), reason: 'x' },
    });
    expect(past.status).toBe(422);
    const snooze = await call('PUT', '/students/[id]/health/snooze', {
      ...as('mentor'),
      params: { id: s.id },
      body: { until: dayFromToday(5), reason: 'در سفر است' },
    });
    expect(snooze.status).toBe(200);
    expect(snooze.body).toMatchObject({
      status: 'red',
      snoozeReason: 'در سفر است',
      snoozedBy: { id: mentor.id },
    });
    expect(await inStuck()).not.toContain(s.id);
    expect(await inStuck({ includeSnoozed: '1' })).toContain(s.id);
    const todayAfter = await call('GET', '/today', { ...as('mentor') });
    expect(todayAfter.body.stuckStudents.map((i: { id: string }) => i.id)).not.toContain(s.id);
    const record = await call('GET', '/students/[id]', { ...as('mentor'), params: { id: s.id } });
    expect(record.body.health.snoozedUntil).toEqual(snooze.body.snoozedUntil);

    const un = await call('DELETE', '/students/[id]/health/snooze', {
      ...as('mentor'),
      params: { id: s.id },
    });
    expect(un.body.snoozedUntil).toBeNull();
    expect(await inStuck()).toContain(s.id);
  });

  it('level filter and red before yellow', async () => {
    const yellow = await studentWithOverdue(4, 'زرد');
    const res = await call('GET', '/stuck', { ...as('mentor') });
    const levels = res.body.map((i: { health: { status: string } }) => i.health.status);
    expect(levels.indexOf('yellow')).toBeGreaterThan(levels.lastIndexOf('red'));
    const onlyYellow = await call('GET', '/stuck', { ...as('mentor'), query: { level: 'yellow' } });
    expect(onlyYellow.body.map((i: { id: string }) => i.id)).toContain(yellow.id);
    expect(
      onlyYellow.body.every((i: { health: { status: string } }) => i.health.status === 'yellow'),
    ).toBe(true);
  });

  it('a paused student is «paused», never stuck; the sweep returns an expired pause to active', async () => {
    const s = await studentWithOverdue(9, 'متوقف');
    const pause = await call('PUT', '/students/[id]/lifecycle', {
      ...as('mentor'),
      params: { id: s.id },
      body: { status: 'paused', pausedUntil: dayFromToday(10) },
    });
    expect(pause.body.health).toMatchObject({ status: 'paused', reasons: [] });
    const stuck = await call('GET', '/stuck', { ...as('mentor'), query: { includeSnoozed: '1' } });
    expect(stuck.body.map((i: { id: string }) => i.id)).not.toContain(s.id);

    await getDb()
      .update(students)
      .set({ pausedUntil: addDays(tehranDay(), -1) })
      .where(eq(students.userId, s.id));
    const result = await sweepAllHealth(getDb());
    expect(result.resumed).toBeGreaterThanOrEqual(1);
    const [row] = await getDb()
      .select({ lifecycle: students.lifecycleStatus, pausedUntil: students.pausedUntil })
      .from(students)
      .where(eq(students.userId, s.id));
    expect(row).toEqual({ lifecycle: 'active', pausedUntil: null });
    expect((await healthOf(s.id)).status).toBe('red');
    const events = await getDb()
      .select({ data: timelineEvents.data, actorId: timelineEvents.actorId })
      .from(timelineEvents)
      .where(
        and(
          eq(timelineEvents.studentId, s.id),
          eq(timelineEvents.type, 'student.lifecycle_changed'),
        ),
      );
    expect(events.at(-1)).toMatchObject({
      actorId: null,
      data: { from: 'paused', to: 'active', automatic: true },
    });
  });

  it('graduated students are untracked and outside the default list', async () => {
    const s = await studentWithOverdue(9, 'فارغ');
    const res = await call('PUT', '/students/[id]/lifecycle', {
      ...as('mentor'),
      params: { id: s.id },
      body: { status: 'graduated' },
    });
    expect(res.body.health.status).toBe('untracked');
  });
});

describe('«منتظر ما»: red without action (data-model.md 4-3)', () => {
  it('a red student with no staff note since red_since shows up; a note clears it', async () => {
    const s = await studentWithOverdue(9, 'بدون اقدام');
    await getDb()
      .update(studentHealth)
      .set({ redSince: new Date(Date.now() - 10 * DAY) })
      .where(eq(studentHealth.studentId, s.id));
    const find = async () =>
      (await call('GET', '/today', { ...as('mentor') })).body.waitingOnUs.find(
        (w: { kind: string; studentId: string }) =>
          w.kind === 'red_no_action' && w.studentId === s.id,
      );
    const item = await find();
    expect(item).toMatchObject({ refId: s.id, breached: true, escalated: true, slaHours: 48 });
    // Escalated: an admin filtering by another mentor still sees it.
    const adminView = await call('GET', '/today', {
      ...as('admin'),
      query: { mentorId: otherMentor.id },
    });
    expect(
      adminView.body.waitingOnUs.some(
        (w: { kind: string; studentId: string }) =>
          w.kind === 'red_no_action' && w.studentId === s.id,
      ),
    ).toBe(true);
    await noteFixture(s.id, mentor.id);
    expect(await find()).toBeUndefined();
  });
});

describe('the student never sees health, reasons, flags or snooze (ADR-0004, T-CANARY)', () => {
  it('no student GET response contains the canary or a health field', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    await taskFixture(s.id, mentor.id, { dueAt: new Date(Date.now() - 9 * DAY) });
    const cookies = (await loginAs(s)).cookies;
    await call('POST', '/students/[id]/flags', {
      ...as('mentor'),
      params: { id: s.id },
      body: { category: 'personal', level: 'red', note: `${CANARY} مشکل خانوادگی` },
    });
    await call('PUT', '/students/[id]/health/snooze', {
      ...as('mentor'),
      params: { id: s.id },
      body: { until: dayFromToday(2), reason: `${CANARY} سفر` },
    });
    expect((await healthOf(s.id)).reasons.length).toBeGreaterThan(0);

    const studentGets = ROUTES.filter(
      (r) =>
        r.method === 'GET' &&
        (r.access === 'any' || (Array.isArray(r.access) && r.access.includes('student'))) &&
        !r.path.includes('[id]'),
    );
    expect(studentGets.map((r) => r.path)).toEqual(
      expect.arrayContaining([
        '/me/student',
        '/me/questions',
        '/me/milestones',
        '/me/checkins/current',
      ]),
    );
    for (const entry of studentGets) {
      const res = await call('GET', entry.path, { cookies });
      expect(res.status, entry.path).toBeLessThan(400);
      const text = JSON.stringify(res.body);
      expect(text, entry.path).not.toContain(CANARY);
      expect(text, entry.path).not.toMatch(/"health"|"churnRisk"|R-OVERDUE|R-FLAG|"flags?"/);
    }
    for (const path of ['/students/[id]/health', '/students/[id]/flags'] as const) {
      const res = await call('GET', path, { cookies, params: { id: s.id } });
      expect(res.status).toBe(403);
    }
    const stuck = await call('GET', '/stuck', { cookies });
    expect(stuck.status).toBe(403);
  });
});

describe('admin recompute', () => {
  it('one student or 422 for an unknown id', async () => {
    const s = await createUser('student', { mentorId: mentor.id, stageId: SEEDED.stages[0] });
    const ok = await call('POST', '/admin/health/recompute', {
      ...as('admin'),
      body: { studentId: s.id },
    });
    expect(ok.body).toEqual({ recomputed: 1, resumed: 0 });
    const bad = await call('POST', '/admin/health/recompute', {
      ...as('admin'),
      body: { studentId: MISSING },
    });
    expect(bad.status).toBe(422);
  });
});
