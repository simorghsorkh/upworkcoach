import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, dayIn } from '@/lib/org-day';
import { tehranDayEnd } from '@/lib/tehran-day';
import { milestoneTypeFixture } from './fixtures';
import { call, createUser, loginAs, type TestUser } from './helpers';

/**
 * Coach Office sprint 5: tasks from a program activity for the whole run, due dates relative
 * to the start of the run, activities marked done, the progress formula (ADR-0012 section 6)
 * and the review queue's program filter. Acceptance steps 9–12 of the MVP scenario.
 */

type Activity = { id: string; nodeType: string; title: string };
type Phase = { id: string; title: string; activities: Activity[] };

let admin: TestUser;
let m1: TestUser;
let m3: TestUser;
let s1: TestUser;
let s2: TestUser;
let ac: Record<string, string>;
let c1: Record<string, string>;
let c3: Record<string, string>;
let cs1: Record<string, string>;
let cs2: Record<string, string>;
let runId = '';
let typeId = '';
let today = '';
const node: Record<string, string> = {};

async function addNode(tplId: string, body: Record<string, unknown>) {
  const res = await call('POST', '/program-templates/[id]/nodes', {
    cookies: ac,
    params: { id: tplId },
    body,
  });
  expect(res.status).toBe(201);
  return res.body.phases as Phase[];
}

beforeAll(async () => {
  admin = await createUser('admin');
  m1 = await createUser('mentor');
  m3 = await createUser('mentor');
  s1 = await createUser('student');
  s2 = await createUser('student');
  ac = (await loginAs(admin)).cookies;
  c1 = (await loginAs(m1)).cookies;
  c3 = (await loginAs(m3)).cookies;
  cs1 = (await loginAs(s1)).cookies;
  cs2 = (await loginAs(s2)).cookies;
  typeId = await milestoneTypeFixture();
  today = dayIn('Asia/Tehran', new Date());

  const tpl = await call('POST', '/program-templates', {
    cookies: ac,
    body: { kind: 'program', title: 'قالب پیشرفت' },
  });
  const tplId = tpl.body.id as string;
  let phases = await addNode(tplId, { nodeType: 'phase', title: 'فاز یک', expectedDays: 7 });
  const p1 = phases[0]?.id;
  phases = await addNode(tplId, { nodeType: 'phase', title: 'فاز دو' });
  const p2 = phases[1]?.id;
  await addNode(tplId, { parentId: p1, nodeType: 'lesson', title: 'درس' });
  await addNode(tplId, {
    parentId: p1,
    nodeType: 'assignment',
    title: 'تکلیف',
    dueOffsetDays: 3,
    submissionType: 'text',
  });
  await addNode(tplId, {
    parentId: p1,
    nodeType: 'checklist',
    title: 'چک‌لیست',
    checklistItems: ['یک', 'دو'],
  });
  await addNode(tplId, {
    parentId: p1,
    nodeType: 'milestone',
    title: 'اولین قرارداد',
    milestoneTypeId: typeId,
  });
  await addNode(tplId, { parentId: p1, nodeType: 'resource', title: 'منبع', isRequired: false });
  await addNode(tplId, {
    parentId: p2,
    nodeType: 'assignment',
    title: 'تکلیف دو',
    dueOffsetDays: 2,
  });
  await addNode(tplId, { parentId: p2, nodeType: 'lesson', title: 'درس دو' });
  const published = await call('POST', '/program-templates/[id]/publish', {
    cookies: ac,
    params: { id: tplId },
  });
  expect(published.status).toBe(200);

  const run = await call('POST', '/program-runs', {
    cookies: ac,
    body: { templateId: tplId, mode: 'group', title: 'گروه پیشرفت', startsOn: today },
  });
  expect(run.status).toBe(201);
  runId = run.body.id as string;
  for (const ph of run.body.phases as Phase[]) {
    for (const a of ph.activities) node[a.title] = a.id;
  }
  const staff = await call('POST', '/program-runs/[id]/staff', {
    cookies: ac,
    params: { id: runId },
    body: { userId: m1.id, role: 'mentor' },
  });
  expect(staff.status).toBe(200);
  const joined = await call('POST', '/program-runs/[id]/enrollments', {
    cookies: ac,
    params: { id: runId },
    body: { studentIds: [s1.id, s2.id] },
  });
  expect(joined.status).toBe(200);
  const started = await call('PATCH', '/program-runs/[id]', {
    cookies: ac,
    params: { id: runId },
    body: { status: 'active' },
  });
  expect(started.status).toBe(200);
});

const getRun = async () =>
  (await call('GET', '/program-runs/[id]', { cookies: ac, params: { id: runId } })).body;

const enrollmentOf = async (studentId: string) =>
  ((await getRun()).enrollments as Array<{ id: string; student: { id: string } }>).find(
    (e) => e.student.id === studentId,
  )?.id ?? '';

const mark = (cookies: Record<string, string>, enrollmentId: string, title: string, body: object) =>
  call('PUT', '/enrollments/[id]/nodes/[nodeId]/completion', {
    cookies,
    params: { id: enrollmentId, nodeId: node[title] ?? '' },
    body,
  });

describe('assign an activity to the whole run', () => {
  it('creates one task per active member, once, due relative to the run start', async () => {
    const first = await call('POST', '/program-runs/[id]/nodes/[nodeId]/assign', {
      cookies: c1,
      params: { id: runId, nodeId: node['تکلیف'] ?? '' },
      body: {},
    });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: 2, skipped: 0 });
    const again = await call('POST', '/program-runs/[id]/nodes/[nodeId]/assign', {
      cookies: ac,
      params: { id: runId, nodeId: node['تکلیف'] ?? '' },
      body: {},
    });
    expect(again.body).toMatchObject({ created: 0, skipped: 2 });

    const task = await call('GET', '/tasks/[id]', {
      cookies: ac,
      params: { id: first.body.taskIds[0] },
    });
    expect(task.status).toBe(200);
    expect(task.body.dueAt).toBe(tehranDayEnd(addDays(today, 3)).toISOString());

    // Phase two starts after phase one's 7 days: 7 + 2.
    const second = await call('POST', '/program-runs/[id]/nodes/[nodeId]/assign', {
      cookies: ac,
      params: { id: runId, nodeId: node['تکلیف دو'] ?? '' },
      body: {},
    });
    const t2 = await call('GET', '/tasks/[id]', {
      cookies: ac,
      params: { id: second.body.taskIds[0] },
    });
    expect(t2.body.dueAt).toBe(tehranDayEnd(addDays(today, 9)).toISOString());

    const run = await getRun();
    expect(run.assignments[node['تکلیف'] ?? '']).toEqual({ assigned: 2, accepted: 0 });
  });

  it('only assignments; only staff of the run; not for an outsider mentor', async () => {
    const lesson = await call('POST', '/program-runs/[id]/nodes/[nodeId]/assign', {
      cookies: ac,
      params: { id: runId, nodeId: node['درس'] ?? '' },
      body: {},
    });
    expect(lesson.status).toBe(422);
    const outsider = await call('POST', '/program-runs/[id]/nodes/[nodeId]/assign', {
      cookies: c3,
      params: { id: runId, nodeId: node['تکلیف'] ?? '' },
      body: {},
    });
    expect(outsider.status).toBe(404);
  });
});

describe('progress (acceptance step 9: the mentee sees feedback and current progress)', () => {
  it('counts lessons, checklists, accepted tasks and approved milestones', async () => {
    const e1 = await enrollmentOf(s1.id);
    const mine = async () =>
      (await call('GET', '/me/programs', { cookies: cs1 })).body.find(
        (p: { enrollmentId: string }) => p.enrollmentId === e1,
      );
    // Required: lesson, assignment, checklist, milestone (phase 1); assignment, lesson (phase 2).
    expect((await mine()).progress).toEqual({ done: 0, total: 6, percent: 0 });

    expect((await mark(cs1, e1, 'درس', { done: true })).body).toEqual({
      done: 1,
      total: 6,
      percent: 16,
    });
    expect((await mark(cs1, e1, 'چک‌لیست', { checklist: [true, false] })).body.done).toBe(1);
    expect((await mark(cs1, e1, 'چک‌لیست', { checklist: [true, true] })).body.done).toBe(2);
    expect((await mark(cs1, e1, 'چک‌لیست', { checklist: [true] })).status).toBe(422);
    // An optional resource does not change the percentage.
    expect((await mark(cs1, e1, 'منبع', { done: true })).body.done).toBe(2);

    // Assignments and typed milestones are not marked; a later phase is locked.
    expect((await mark(cs1, e1, 'تکلیف', { done: true })).status).toBe(422);
    expect((await mark(cs1, e1, 'اولین قرارداد', { done: true })).status).toBe(422);
    expect((await mark(cs1, e1, 'درس دو', { done: true })).status).toBe(409);
    // Someone else's enrollment, and a mentor without the mentee.
    expect((await mark(cs2, e1, 'درس', { done: true })).status).toBe(404);
    expect((await mark(c3, e1, 'درس', { done: true })).status).toBe(404);

    const view = await mine();
    const p1 = view.phases[0];
    const byTitle = (t: string) => p1.activities.find((a: { title: string }) => a.title === t);
    expect(byTitle('درس')).toMatchObject({ done: true, canMark: true });
    expect(byTitle('چک‌لیست')).toMatchObject({ done: true, checklistState: [true, true] });
    expect(byTitle('تکلیف')).toMatchObject({ done: false, canMark: false });
    expect(byTitle('تکلیف').task.status).toBe('open');
    expect(view.phases[1].state).toBe('locked');

    // The accepted task counts; a submitted one does not.
    const taskId = byTitle('تکلیف').task.id as string;
    const sub = await call('POST', '/tasks/[id]/submissions', {
      cookies: cs1,
      params: { id: taskId },
      body: { bodyText: 'تحویل تکلیف' },
    });
    expect(sub.status).toBe(201);
    expect((await mine()).progress.done).toBe(2);

    // Acceptance step 10: the review queue filtered by program, student and SLA state.
    const queue = await call('GET', '/review-queue', {
      cookies: c1,
      query: { runId, studentId: s1.id },
    });
    expect(queue.status).toBe(200);
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({
      taskId,
      program: { runId, title: 'گروه پیشرفت', isLegacy: false },
    });
    const okOnly = await call('GET', '/review-queue', {
      cookies: c1,
      query: { runId, sla: 'ok' },
    });
    expect(okOnly.body.map((i: { taskId: string }) => i.taskId)).toContain(taskId);
    const breached = await call('GET', '/review-queue', {
      cookies: c1,
      query: { runId, sla: 'breached' },
    });
    expect(breached.body).toHaveLength(0);
    const otherStudent = await call('GET', '/review-queue', {
      cookies: c1,
      query: { runId, studentId: s2.id },
    });
    expect(otherStudent.body).toHaveLength(0);

    const review = await call('POST', '/submissions/[id]/review', {
      cookies: ac,
      params: { id: sub.body.id },
      body: { outcome: 'accepted', feedbackText: 'خوب بود' },
    });
    expect(review.status).toBe(201);
    expect((await mine()).progress).toEqual({ done: 3, total: 6, percent: 50 });

    // A milestone of the activity's type, once approved.
    const proposed = await call('POST', '/me/milestones', {
      cookies: cs1,
      body: { typeId, occurredOn: today },
    });
    expect(proposed.status).toBe(201);
    expect((await mine()).progress.done).toBe(3);
    const approved = await call('POST', '/milestones/[id]/approve', {
      cookies: ac,
      params: { id: proposed.body.id },
    });
    expect(approved.status).toBe(200);
    expect((await mine()).progress).toEqual({ done: 4, total: 6, percent: 66 });

    // Undo.
    expect((await mark(cs1, e1, 'درس', { done: false })).body.done).toBe(3);
    expect((await mark(cs1, e1, 'درس', { done: true })).body.done).toBe(4);
  });

  it('acceptance step 11: staff see each member and the run average', async () => {
    const run = await getRun();
    const progress = (id: string) =>
      run.enrollments.find((e: { student: { id: string } }) => e.student.id === id).progress;
    expect(progress(s1.id)).toEqual({ done: 4, total: 6, percent: 66 });
    expect(progress(s2.id)).toEqual({ done: 0, total: 6, percent: 0 });
    expect(run.averageProgress).toBe(33);
    expect(run.assignments[node['تکلیف'] ?? '']).toEqual({ assigned: 2, accepted: 1 });

    const list = await call('GET', '/students/[id]/enrollments', {
      cookies: c1,
      params: { id: s1.id },
    });
    const here = list.body.find((e: { run: { id: string } }) => e.run.id === runId);
    expect(here.progress.percent).toBe(66);
  });

  it('a staff member marks a lesson for a mentee; the outsider mentor cannot', async () => {
    const e2 = await enrollmentOf(s2.id);
    expect((await mark(c1, e2, 'درس', { done: true })).body.done).toBe(1);
    expect((await mark(c3, e2, 'درس', { done: true })).status).toBe(404);
  });
});
