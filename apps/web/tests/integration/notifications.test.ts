import { beforeAll, describe, expect, it } from 'vitest';
import { dayFromToday } from './fixtures';
import { call, createUser, loginAs, type TestUser } from './helpers';

/**
 * Coach Office sprint 6b: in-app notifications along the daily loop — task → submission →
 * review, question → answer, session — each to the right person only, never to the actor.
 */

type Item = {
  id: string;
  kind: string;
  href: string;
  data: { title?: string; outcome?: string; at?: string };
  student: { id: string; displayName: string } | null;
  actor: { displayName: string } | null;
  read: boolean;
};

let mentor: TestUser;
let student: TestUser;
let other: TestUser;
const c: Record<string, Record<string, string>> = {};

async function inbox(who: string): Promise<{ items: Item[]; unread: number }> {
  const res = await call('GET', '/notifications', { cookies: c[who] });
  expect(res.status).toBe(200);
  return res.body;
}

beforeAll(async () => {
  mentor = await createUser('mentor', { displayName: 'مشاور اعلان' });
  student = await createUser('student', { mentorId: mentor.id, displayName: 'هنرجوی اعلان' });
  other = await createUser('student', { mentorId: mentor.id });
  for (const [k, u] of Object.entries({ mentor, student, other })) {
    c[k] = (await loginAs(u)).cookies;
  }
});

describe('the task loop', () => {
  let taskId = '';

  it('a new task reaches the mentee, with its link and the actor', async () => {
    const created = await call('POST', '/students/[id]/tasks', {
      cookies: c.mentor,
      params: { id: student.id },
      body: { title: 'تیتر پروفایل', dueDate: dayFromToday(3) },
    });
    expect(created.status).toBe(201);
    taskId = created.body.id as string;
    const box = await inbox('student');
    expect(box.unread).toBe(1);
    expect(box.items[0]).toMatchObject({
      kind: 'task_assigned',
      href: `/my/tasks/${taskId}`,
      data: { title: 'تیتر پروفایل' },
      student: null,
      actor: { displayName: 'مشاور اعلان' },
      read: false,
    });
    expect((await inbox('mentor')).items).toEqual([]);
    expect((await inbox('other')).items).toEqual([]);
  });

  it('a submission reaches the reviewer; the review reaches the mentee', async () => {
    const sub = await call('POST', '/tasks/[id]/submissions', {
      cookies: c.student,
      params: { id: taskId },
      body: { bodyText: 'نسخه‌ی اول' },
    });
    expect(sub.status).toBe(201);
    const staff = await inbox('mentor');
    expect(staff.items[0]).toMatchObject({
      kind: 'task_submitted',
      href: `/tasks/${taskId}`,
      student: { id: student.id, displayName: 'هنرجوی اعلان' },
    });
    const review = await call('POST', '/submissions/[id]/review', {
      cookies: c.mentor,
      params: { id: sub.body.id },
      body: { outcome: 'changes_requested', feedbackText: 'کوتاه‌ترش کن.' },
    });
    expect(review.status).toBe(201);
    expect((await inbox('student')).items[0]).toMatchObject({
      kind: 'task_reviewed',
      data: { title: 'تیتر پروفایل', outcome: 'changes_requested' },
    });
  });
});

describe('questions and sessions', () => {
  it('a question reaches its assignee; the answer reaches the mentee', async () => {
    const asked = await call('POST', '/me/questions', {
      cookies: c.student,
      body: { subject: 'قیمت پروژه', body: 'چقدر پیشنهاد بدهم؟' },
    });
    expect(asked.status).toBe(201);
    const threadId = asked.body.id as string;
    expect((await inbox('mentor')).items[0]).toMatchObject({
      kind: 'question_new',
      href: `/questions/${threadId}`,
      data: { title: 'قیمت پروژه' },
    });
    const answer = await call('POST', '/questions/[id]/messages', {
      cookies: c.mentor,
      params: { id: threadId },
      body: { body: 'از نرخ بازار شروع کن.' },
    });
    expect(answer.status).toBe(201);
    expect((await inbox('student')).items[0]).toMatchObject({
      kind: 'question_reply',
      href: `/my/questions/${threadId}`,
    });
  });

  it('a one-to-one session reaches only that member', async () => {
    const enrollments = await call('GET', '/students/[id]/enrollments', {
      cookies: c.mentor,
      params: { id: student.id },
    });
    const main = (
      enrollments.body as Array<{ id: string; run: { id: string; isLegacy: boolean } }>
    ).find((e) => e.run.isLegacy);
    const res = await call('POST', '/sessions', {
      cookies: c.mentor,
      body: {
        runId: main?.run.id,
        enrollmentId: main?.id,
        day: dayFromToday(2),
        time: '18:00',
        durationMinutes: 45,
      },
    });
    expect(res.status).toBe(201);
    const top = (await inbox('student')).items[0];
    expect(top).toMatchObject({ kind: 'session_scheduled', href: '/my/programs' });
    expect(top?.data.at).toEqual(expect.any(String));
    expect((await inbox('other')).items).toEqual([]);
  });
});

describe('reading', () => {
  it('marks own ids only, then everything', async () => {
    const before = await inbox('student');
    expect(before.unread).toBe(4);
    const first = before.items[0]?.id ?? '';
    const foreign = (await inbox('mentor')).items[0]?.id ?? '';
    const res = await call('POST', '/notifications/read', {
      cookies: c.student,
      body: { ids: [first, foreign] },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unread: 3 });
    expect((await inbox('mentor')).items.find((i) => i.id === foreign)?.read).toBe(false);
    const all = await call('POST', '/notifications/read', { cookies: c.student, body: {} });
    expect(all.body).toEqual({ unread: 0 });
  });

  it('pages with a cursor', async () => {
    const res = await call('GET', '/notifications', {
      cookies: c.student,
      query: { limit: '2' },
    });
    expect(res.body.items).toHaveLength(2);
    const next = await call('GET', '/notifications', {
      cookies: c.student,
      query: { limit: '2', cursor: res.body.nextCursor },
    });
    expect(next.body.items).toHaveLength(2);
    expect(next.body.nextCursor).toBeNull();
    const ids = [...res.body.items, ...next.body.items].map((i: Item) => i.id);
    expect(new Set(ids).size).toBe(4);
  });
});
