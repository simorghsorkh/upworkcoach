import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, dateTimeIn, dayIn } from '@/lib/org-day';
import { call, createUser, loginAs, type TestUser } from './helpers';

/**
 * Coach Office sprint 5b: one-on-one packages, mentoring sessions and goals (ADR-0012
 * sections 4, 6 and 7). Acceptance step 7 of the MVP scenario: a mentee in the package
 * «one-on-one: 8 sessions in 2 months»; the mentor books and holds a session and leaves a
 * next action; the package use shows.
 */

type Session = {
  id: string;
  student: { id: string } | null;
  mentor: { id: string };
  scheduledAt: string;
  status: string;
  actions: Array<{ id: string; title: string; student: { id: string } }>;
  can: { edit: boolean };
};

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
let today = '';
let oneRunId = '';
let oneEnrollment = '';
let groupRunId = '';
let firstSession = '';

async function publishedTemplate(body: Record<string, unknown>): Promise<string> {
  const tpl = await call('POST', '/program-templates', { cookies: ac, body });
  expect(tpl.status).toBe(201);
  const id = tpl.body.id as string;
  const phase = await call('POST', '/program-templates/[id]/nodes', {
    cookies: ac,
    params: { id },
    body: { nodeType: 'phase', title: 'دوره' },
  });
  expect(phase.status).toBe(201);
  const published = await call('POST', '/program-templates/[id]/publish', {
    cookies: ac,
    params: { id },
  });
  expect(published.status).toBe(200);
  return id;
}

async function runWith(
  templateId: string,
  mode: 'group' | 'individual',
  students: string[],
): Promise<string> {
  const run = await call('POST', '/program-runs', {
    cookies: ac,
    body: { templateId, mode, title: `اجرا ${mode}`, startsOn: today },
  });
  expect(run.status).toBe(201);
  const id = run.body.id as string;
  const staff = await call('POST', '/program-runs/[id]/staff', {
    cookies: ac,
    params: { id },
    body: { userId: m1.id, role: 'mentor' },
  });
  expect(staff.status).toBe(200);
  const joined = await call('POST', '/program-runs/[id]/enrollments', {
    cookies: ac,
    params: { id },
    body: { studentIds: students },
  });
  expect(joined.status).toBe(200);
  return id;
}

const runOf = async (id: string) =>
  (await call('GET', '/program-runs/[id]', { cookies: ac, params: { id } })).body;

const usageOf = async () =>
  (
    (await runOf(oneRunId)).enrollments as Array<{ id: string; usage: unknown; progress: unknown }>
  )[0];

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
  today = dayIn('Asia/Tehran', new Date());

  const pkg = await publishedTemplate({
    kind: 'one_on_one',
    title: 'تک‌به‌تک: ۸ جلسه در ۲ ماه',
    sessionQuota: 8,
    sessionMinutes: 60,
    validityDays: 60,
  });
  oneRunId = await runWith(pkg, 'individual', [s1.id]);
  oneEnrollment = ((await runOf(oneRunId)).enrollments as Array<{ id: string }>)[0]?.id ?? '';
  const program = await publishedTemplate({ kind: 'program', title: 'برنامه‌ی گروهی' });
  groupRunId = await runWith(program, 'group', [s1.id, s2.id]);
});

describe('package (ADR-0012 section 4)', () => {
  it('the enrollment copies the quota and validity; nothing used yet', async () => {
    expect((await usageOf())?.usage).toEqual({
      quota: 8,
      used: 0,
      remaining: 8,
      validUntil: addDays(today, 60),
      daysLeft: 60,
      overQuota: false,
      expired: false,
    });
  });
});

describe('sessions', () => {
  const tomorrow = () => addDays(today, 1);

  it('the mentor books a session in the organization time zone; overlaps only warn', async () => {
    const res = await call('POST', '/sessions', {
      cookies: c1,
      body: {
        runId: oneRunId,
        enrollmentId: oneEnrollment,
        day: tomorrow(),
        time: '10:00',
        durationMinutes: 60,
        location: 'https://meet.example.com/abc',
      },
    });
    expect(res.status).toBe(201);
    const session = res.body.session as Session;
    firstSession = session.id;
    expect(res.body.overlaps).toBe(0);
    expect(session.student?.id).toBe(s1.id);
    expect(session.mentor.id).toBe(m1.id);
    expect(session.scheduledAt).toBe(dateTimeIn('Asia/Tehran', tomorrow(), 10, 0).toISOString());

    const second = await call('POST', '/sessions', {
      cookies: c1,
      body: {
        runId: oneRunId,
        enrollmentId: oneEnrollment,
        day: tomorrow(),
        time: '10:30',
        durationMinutes: 30,
      },
    });
    expect(second.status).toBe(201);
    expect(second.body.overlaps).toBe(1);
  });

  it('rejects a link that is not https, and a member of another run', async () => {
    const bad = await call('POST', '/sessions', {
      cookies: c1,
      body: {
        runId: oneRunId,
        enrollmentId: oneEnrollment,
        day: tomorrow(),
        time: '12:00',
        durationMinutes: 30,
        location: 'http://insecure.example.com',
      },
    });
    expect(bad.status).toBe(422);
    const elsewhere = await call('POST', '/sessions', {
      cookies: c1,
      body: {
        runId: groupRunId,
        enrollmentId: oneEnrollment,
        day: tomorrow(),
        time: '12:00',
        durationMinutes: 30,
      },
    });
    expect(elsewhere.status).toBe(422);
  });

  it('an unrelated mentor sees nothing and changes nothing', async () => {
    const list = await call('GET', '/sessions', { cookies: c3, query: { runId: oneRunId } });
    expect(list.status).toBe(404);
    const own = await call('GET', '/sessions', { cookies: c3 });
    expect(own.status).toBe(200);
    expect(own.body).toEqual([]);
    const patch = await call('PATCH', '/sessions/[id]', {
      cookies: c3,
      params: { id: firstSession },
      body: { status: 'held' },
    });
    expect(patch.status).toBe(404);
    const book = await call('POST', '/sessions', {
      cookies: c3,
      body: {
        runId: oneRunId,
        enrollmentId: oneEnrollment,
        day: tomorrow(),
        time: '09:00',
        durationMinutes: 30,
      },
    });
    expect(book.status).toBe(404);
  });

  it('the mentee sees their own upcoming sessions, another mentee does not', async () => {
    const mine = await call('GET', '/sessions', { cookies: cs1, query: { when: 'upcoming' } });
    expect(mine.status).toBe(200);
    expect((mine.body as Session[]).map((s) => s.id)).toContain(firstSession);
    expect((mine.body as Session[]).every((s) => !s.can.edit)).toBe(true);
    const other = await call('GET', '/sessions', { cookies: cs2 });
    expect(other.body).toEqual([]);
  });

  it('held and missed sessions use the package unless excused; cancelled ones do not', async () => {
    const held = await call('PATCH', '/sessions/[id]', {
      cookies: c1,
      params: { id: firstSession },
      body: { status: 'held' },
    });
    expect(held.status).toBe(200);
    expect(held.body.session.status).toBe('held');
    expect((await usageOf())?.usage).toMatchObject({ used: 1, remaining: 7 });

    const list = await call('GET', '/sessions', { cookies: c1, query: { runId: oneRunId } });
    const other = (list.body as Session[]).find((s) => s.id !== firstSession) as Session;
    const missed = await call('PATCH', '/sessions/[id]', {
      cookies: c1,
      params: { id: other.id },
      body: { status: 'no_show', countsTowardQuota: false },
    });
    expect(missed.status).toBe(200);
    expect((await usageOf())?.usage).toMatchObject({ used: 1 });
    const counted = await call('PATCH', '/sessions/[id]', {
      cookies: c1,
      params: { id: other.id },
      body: { countsTowardQuota: true },
    });
    expect(counted.status).toBe(200);
    expect((await usageOf())?.usage).toMatchObject({ used: 2, remaining: 6 });
    const cancelled = await call('PATCH', '/sessions/[id]', {
      cookies: c1,
      params: { id: other.id },
      body: { status: 'cancelled', cancelledReason: 'بیماری' },
    });
    expect(cancelled.body.session).toMatchObject({
      status: 'cancelled',
      cancelledReason: 'بیماری',
    });
    expect((await usageOf())?.usage).toMatchObject({ used: 1 });
  });

  it('reschedules keeping the time when only the day changes', async () => {
    const moved = await call('PATCH', '/sessions/[id]', {
      cookies: c1,
      params: { id: firstSession },
      body: { day: addDays(today, 3) },
    });
    expect(moved.status).toBe(200);
    expect(moved.body.session.scheduledAt).toBe(
      dateTimeIn('Asia/Tehran', addDays(today, 3), 10, 0).toISOString(),
    );
  });

  it('a next action becomes the mentee’s task', async () => {
    const res = await call('POST', '/sessions/[id]/actions', {
      cookies: c1,
      params: { id: firstSession },
      body: { title: 'به‌روز کردن پروفایل', dueDate: addDays(today, 5) },
    });
    expect(res.status).toBe(201);
    expect((res.body as Session).actions).toHaveLength(1);
    const tasks = await call('GET', '/me/tasks', { cookies: cs1 });
    expect(tasks.status).toBe(200);
    const items = (Array.isArray(tasks.body) ? tasks.body : tasks.body.items) as Array<{
      title: string;
    }>;
    expect(items.map((t) => t.title)).toContain('به‌روز کردن پروفایل');
  });

  it('a group session: only for a group run, seen by every member; an action needs a member', async () => {
    const res = await call('POST', '/sessions', {
      cookies: c1,
      body: { runId: groupRunId, day: tomorrow(), time: '18:00', durationMinutes: 90 },
    });
    expect(res.status).toBe(201);
    const group = res.body.session as Session;
    expect(group.student).toBeNull();
    const seen = await call('GET', '/sessions', { cookies: cs2, query: { when: 'upcoming' } });
    expect((seen.body as Session[]).map((s) => s.id)).toContain(group.id);

    const noMember = await call('POST', '/sessions/[id]/actions', {
      cookies: c1,
      params: { id: group.id },
      body: { title: 'تمرین', dueDate: addDays(today, 4) },
    });
    expect(noMember.status).toBe(422);
    const forS2 = await call('POST', '/sessions/[id]/actions', {
      cookies: c1,
      params: { id: group.id },
      body: { title: 'تمرین', dueDate: addDays(today, 4), studentId: s2.id },
    });
    expect(forS2.status).toBe(201);
    // Each mentee sees only their own actions of a group session.
    const s1View = await call('GET', '/sessions', { cookies: cs1, query: { runId: groupRunId } });
    expect((s1View.body as Session[])[0]?.actions).toEqual([]);

    const notGroup = await call('POST', '/sessions', {
      cookies: c1,
      body: { runId: oneRunId, day: tomorrow(), time: '18:00', durationMinutes: 30 },
    });
    expect(notGroup.status).toBe(422);
  });

  it('the mentor’s own list holds their sessions only', async () => {
    const mine = await call('GET', '/sessions', { cookies: c1, query: { when: 'upcoming' } });
    expect(mine.status).toBe(200);
    expect((mine.body as Session[]).every((s) => s.mentor.id === m1.id)).toBe(true);
    expect((mine.body as Session[]).length).toBeGreaterThan(0);
  });
});

describe('goals and one-on-one progress (ADR-0012 section 6)', () => {
  it('progress = achieved / not dropped; unknown without goals', async () => {
    expect((await usageOf())?.progress).toEqual({ done: 0, total: 0, percent: null });
    const a = await call('POST', '/enrollments/[id]/goals', {
      cookies: c1,
      params: { id: oneEnrollment },
      body: { title: 'پروفایل کامل', targetDate: addDays(today, 14) },
    });
    expect(a.status).toBe(201);
    const b = await call('POST', '/enrollments/[id]/goals', {
      cookies: c1,
      params: { id: oneEnrollment },
      body: { title: 'اولین قرارداد' },
    });
    const c = await call('POST', '/enrollments/[id]/goals', {
      cookies: c1,
      params: { id: oneEnrollment },
      body: { title: 'هدف کنارگذاشته' },
    });
    const done = await call('PATCH', '/goals/[id]', {
      cookies: c1,
      params: { id: a.body.id },
      body: { status: 'achieved' },
    });
    expect(done.status).toBe(200);
    expect(done.body.decidedAt).not.toBeNull();
    await call('PATCH', '/goals/[id]', {
      cookies: c1,
      params: { id: c.body.id },
      body: { status: 'dropped' },
    });
    expect(b.status).toBe(201);
    expect((await usageOf())?.progress).toEqual({ done: 1, total: 2, percent: 50 });
  });

  it('the mentee reads their goals; others get 404', async () => {
    const own = await call('GET', '/enrollments/[id]/goals', {
      cookies: cs1,
      params: { id: oneEnrollment },
    });
    expect(own.status).toBe(200);
    expect(own.body.can.edit).toBe(false);
    expect(own.body.goals).toHaveLength(3);
    const other = await call('GET', '/enrollments/[id]/goals', {
      cookies: cs2,
      params: { id: oneEnrollment },
    });
    expect(other.status).toBe(404);
    const stranger = await call('POST', '/enrollments/[id]/goals', {
      cookies: c3,
      params: { id: oneEnrollment },
      body: { title: 'x' },
    });
    expect(stranger.status).toBe(404);
  });

  it('the mentee sees progress and package use in «my programs»', async () => {
    const mine = await call('GET', '/me/programs', { cookies: cs1 });
    expect(mine.status).toBe(200);
    const one = (
      mine.body as Array<{ enrollmentId: string; progress: unknown; usage: unknown }>
    ).find((p) => p.enrollmentId === oneEnrollment);
    expect(one?.progress).toMatchObject({ percent: 50 });
    expect(one?.usage).toMatchObject({ quota: 8, used: 1 });
  });
});
