import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { recomputeHealth } from '@/modules/health/recompute';
import { enrollments } from '@/modules/programs/schema';
import { getDb } from '@/server/db';
import { call, createUser, loginAs, type TestUser } from './helpers';

/**
 * Coach Office sprint 5c: every course has its own phases, and the staff screens read them —
 * the student list (course and phase filter, each student's place in their courses), «امروز»
 * (same list items), the record's phase change and the health rules (R-STALL per course).
 */

const DAY = 24 * 3600 * 1000;

type Course = {
  enrollmentId: string;
  run: { id: string; title: string };
  phase: { id: string; position: number } | null;
  phaseCount: number;
  daysInPhase: number | null;
};
type Item = { id: string; courses: Course[] };

let admin: TestUser;
let mentor: TestUser;
let s1: TestUser;
let s2: TestUser;
let ac: Record<string, string>;
let mc: Record<string, string>;
let runId = '';
let phases: Array<{ id: string; title: string }> = [];

async function students(query: Record<string, string>): Promise<Item[]> {
  const res = await call('GET', '/students', { cookies: ac, query });
  expect(res.status).toBe(200);
  return res.body.items as Item[];
}

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor');
  s1 = await createUser('student', { mentorId: mentor.id, displayName: 'هنرجوی دوره الف' });
  s2 = await createUser('student', { mentorId: mentor.id, displayName: 'هنرجوی دوره ب' });
  ac = (await loginAs(admin)).cookies;
  mc = (await loginAs(mentor)).cookies;

  const tpl = await call('POST', '/program-templates', {
    cookies: ac,
    body: { kind: 'program', title: 'دوره‌ی پروپوزال‌نویسی' },
  });
  expect(tpl.status).toBe(201);
  const templateId = tpl.body.id as string;
  for (const [title, expectedDays] of [
    ['شناخت بازار', 5],
    ['نوشتن پروپوزال', 10],
    ['پیگیری', null],
  ] as const) {
    const node = await call('POST', '/program-templates/[id]/nodes', {
      cookies: ac,
      params: { id: templateId },
      body: { nodeType: 'phase', title, ...(expectedDays ? { expectedDays } : {}) },
    });
    expect(node.status).toBe(201);
  }
  const published = await call('POST', '/program-templates/[id]/publish', {
    cookies: ac,
    params: { id: templateId },
  });
  expect(published.status).toBe(200);
  const run = await call('POST', '/program-runs', {
    cookies: ac,
    body: { templateId, mode: 'group', title: 'کلاس پروپوزال پاییز' },
  });
  expect(run.status).toBe(201);
  runId = run.body.id as string;
  phases = (run.body.phases as Array<{ id: string; title: string }>).map((p) => ({
    id: p.id,
    title: p.title,
  }));
  const joined = await call('POST', '/program-runs/[id]/enrollments', {
    cookies: ac,
    params: { id: runId },
    body: { studentIds: [s1.id, s2.id] },
  });
  expect(joined.status).toBe(200);
  const staff = await call('POST', '/program-runs/[id]/staff', {
    cookies: ac,
    params: { id: runId },
    body: { userId: mentor.id, role: 'mentor' },
  });
  expect(staff.status).toBe(200);
});

describe('student list: each student’s place in their courses', () => {
  it('list items carry the course phase; the main path is not repeated there', async () => {
    const items = await students({ runId });
    expect(items.map((i) => i.id).sort()).toEqual([s1.id, s2.id].sort());
    const course = items.find((i) => i.id === s1.id)?.courses;
    expect(course).toHaveLength(1);
    expect(course?.[0]).toMatchObject({
      run: { id: runId, title: 'کلاس پروپوزال پاییز' },
      phase: { id: phases[0]?.id, position: 1 },
      phaseCount: 3,
      daysInPhase: 0,
    });
  });

  it('filters by course and by one of its phases; a phase change moves the student', async () => {
    expect(await students({ runId, phaseId: phases[1]?.id ?? '' })).toEqual([]);
    const enrollmentId = (await students({ runId })).find((i) => i.id === s1.id)?.courses[0]
      ?.enrollmentId as string;
    const moved = await call('PUT', '/enrollments/[id]/phase', {
      cookies: mc,
      params: { id: enrollmentId },
      body: { toNodeId: phases[1]?.id, kind: 'advance' },
    });
    expect(moved.status).toBe(200);
    const second = await students({ runId, phaseId: phases[1]?.id ?? '' });
    expect(second.map((i) => i.id)).toEqual([s1.id]);
    expect(second[0]?.courses[0]?.phase?.position).toBe(2);
  });

  it('the mentor sees the same through their scope', async () => {
    const res = await call('GET', '/students', { cookies: mc, query: { runId } });
    expect(res.status).toBe(200);
    expect((res.body.items as Item[]).length).toBe(2);
  });
});

describe('the record: the course and its phases', () => {
  it('each enrollment lists its run’s phases for the phase change', async () => {
    const res = await call('GET', '/students/[id]/enrollments', {
      cookies: ac,
      params: { id: s2.id },
    });
    expect(res.status).toBe(200);
    const course = (res.body as Array<{ run: { id: string }; phases: Array<{ id: string }> }>).find(
      (e) => e.run.id === runId,
    );
    expect(course?.phases.map((p) => p.id)).toEqual(phases.map((p) => p.id));
  });
});

describe('health: R-STALL per course (ADR-0005 rules on each course’s phases)', () => {
  it('a phase twice past its expected days makes the student red', async () => {
    await getDb()
      .update(enrollments)
      .set({ phaseEnteredAt: new Date(Date.now() - 11 * DAY) })
      .where(and(eq(enrollments.runId, runId), eq(enrollments.studentId, s2.id)));
    await recomputeHealth(getDb(), [s2.id]);
    const res = await call('GET', '/students/[id]/health', {
      cookies: mc,
      params: { id: s2.id },
    });
    expect(res.status).toBe(200);
    const stall = (res.body.reasons as Array<{ rule: string; level: string; facts: unknown }>).find(
      (r) => r.rule === 'R-STALL',
    );
    expect(stall).toMatchObject({ level: 'red', facts: { daysInStage: 11, expectedDays: 5 } });
  });

  it('a paused enrollment does not count', async () => {
    const enrollment = (await students({ runId })).find((i) => i.id === s2.id)?.courses[0]
      ?.enrollmentId as string;
    const paused = await call('PATCH', '/enrollments/[id]', {
      cookies: ac,
      params: { id: enrollment },
      body: {
        status: 'paused',
        pausedUntil: new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10),
      },
    });
    expect(paused.status).toBe(200);
    await recomputeHealth(getDb(), [s2.id]);
    const res = await call('GET', '/students/[id]/health', {
      cookies: mc,
      params: { id: s2.id },
    });
    expect((res.body.reasons as Array<{ rule: string }>).some((r) => r.rule === 'R-STALL')).toBe(
      false,
    );
  });
});
