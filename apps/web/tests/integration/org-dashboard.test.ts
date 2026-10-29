import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { recomputeHealth } from '@/modules/health/recompute';
import { createOrganization } from '@/modules/identity/organizations';
import { enrollments } from '@/modules/programs/schema';
import { tasks } from '@/modules/tasks/schema';
import { getDb } from '@/server/db';
import { call, createUser, loginAs, type TestUser } from './helpers';

/** Coach Office sprint 6: GET /dashboard/organization, in an organization of its own. */

const DAY = 24 * 3600 * 1000;

let admin: TestUser;
let mentor: TestUser;
let s1: TestUser;
let s2: TestUser;
let s3: TestUser;
let ac: Record<string, string>;
let mc: Record<string, string>;
let runId = '';

beforeAll(async () => {
  const org = (
    await createOrganization({ slug: `dash-${crypto.randomUUID().slice(0, 8)}`, name: 'داشبورد' })
  ).id;
  admin = await createUser('admin', { organizationId: org });
  mentor = await createUser('mentor', { organizationId: org, displayName: 'مشاور داشبورد' });
  s1 = await createUser('student', { organizationId: org, mentorId: mentor.id });
  s2 = await createUser('student', { organizationId: org, mentorId: mentor.id });
  s3 = await createUser('student', { organizationId: org, mentorId: mentor.id });
  ac = (await loginAs(admin)).cookies;
  mc = (await loginAs(mentor)).cookies;

  const tpl = await call('POST', '/program-templates', {
    cookies: ac,
    body: { kind: 'program', title: 'دوره‌ی داشبورد' },
  });
  const templateId = tpl.body.id as string;
  await call('POST', '/program-templates/[id]/nodes', {
    cookies: ac,
    params: { id: templateId },
    body: { nodeType: 'phase', title: 'تنها فاز', expectedDays: 5 },
  });
  await call('POST', '/program-templates/[id]/publish', {
    cookies: ac,
    params: { id: templateId },
  });
  const run = await call('POST', '/program-runs', {
    cookies: ac,
    body: { templateId, mode: 'group', title: 'گروه داشبورد' },
  });
  runId = run.body.id as string;
  await call('POST', '/program-runs/[id]/enrollments', {
    cookies: ac,
    params: { id: runId },
    body: { studentIds: [s1.id, s2.id] },
  });
  await call('POST', '/program-runs/[id]/staff', {
    cookies: ac,
    params: { id: runId },
    body: { userId: mentor.id, role: 'mentor' },
  });

  // s1: 11 days in a 5-day phase → red (R-STALL); s3: one task past its deadline.
  await getDb()
    .update(enrollments)
    .set({ phaseEnteredAt: new Date(Date.now() - 11 * DAY) })
    .where(and(eq(enrollments.runId, runId), eq(enrollments.studentId, s1.id)));
  await recomputeHealth(getDb(), [s1.id]);
  const task = await call('POST', '/students/[id]/tasks', {
    cookies: ac,
    params: { id: s3.id },
    body: { title: 'کار عقب‌افتاده' },
  });
  expect(task.status).toBe(201);
  await getDb()
    .update(tasks)
    .set({ dueAt: new Date(Date.now() - 2 * DAY) })
    .where(eq(tasks.id, task.body.id as string));
});

describe('GET /dashboard/organization', () => {
  it('is for admins only', async () => {
    expect((await call('GET', '/dashboard/organization', { cookies: mc })).status).toBe(403);
  });

  it('counts mentees, health, overdue work, courses and each mentor’s load', async () => {
    const res = await call('GET', '/dashboard/organization', { cookies: ac });
    expect(res.status).toBe(200);
    // s3's task creation computed its health (green, before the deadline moved); s2 has none yet.
    expect(res.body.students).toEqual({ active: 3, paused: 0, red: 1, yellow: 0, green: 1 });
    expect(res.body.work).toEqual({
      reviews: 0,
      breachedReviews: 0,
      unansweredQuestions: 0,
      breachedQuestions: 0,
      overdueTasks: 1,
    });
    const [main, course] = res.body.courses;
    expect(main).toMatchObject({ isLegacy: true, active: 3, paused: 0, red: 1 });
    expect(main.averageProgress).toBeNull();
    expect(course).toMatchObject({
      id: runId,
      title: 'گروه داشبورد',
      isLegacy: false,
      mode: 'group',
      active: 2,
      red: 1,
      yellow: 0,
      averageProgress: null,
      staff: ['مشاور داشبورد'],
    });
    const row = (res.body.mentors as Array<{ id: string }>).find((m) => m.id === mentor.id);
    expect(row).toMatchObject({ students: 3, primary: 3, runs: 1, red: 1, atCapacity: false });
  });
});
