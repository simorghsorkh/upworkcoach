import { beforeAll, describe, expect, it } from 'vitest';
import { call, createUser, loginAs, SEEDED, type TestUser, uniquePhone } from './helpers';

/**
 * Sprint-2 frontend gaps closed in sprint 4 (only fields added; no signature changed):
 * list counters and tags, `overExpected` in the list, the stage position, `accountStatus`
 * on the kanban (health.test.ts), the staff settings view (settings.test.ts) and the
 * «go to the existing record» link of 409 PHONE_TAKEN — admin only.
 */

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

describe('GET /students counters and GET /students/tags', () => {
  it('counts by lifecycle ignore the lifecycle filter; total follows the whole request', async () => {
    const tag = `برچسب-${uniquePhone().slice(-6)}`;
    const made: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await call('POST', '/students', {
        ...as('mentor'),
        body: { displayName: `شمارش ${i}`, phone: uniquePhone(), tags: [tag] },
      });
      made.push(res.body.student.id);
    }
    await call('PUT', '/students/[id]/lifecycle', {
      ...as('mentor'),
      params: { id: made[0] ?? '' },
      body: { status: 'graduated' },
    });
    const res = await call('GET', '/students', { ...as('mentor'), query: { tag } });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.counts).toMatchObject({
      total: 2,
      byLifecycle: { active: 2, paused: 0, graduated: 1, dropped: 0 },
    });
    expect(res.body.counts.byHealth.green + res.body.counts.byHealth.none).toBe(2);

    const tags = await call('GET', '/students/tags', { ...as('mentor') });
    expect(tags.body.tags).toContainEqual({ tag, count: 2 });
    const all = await call('GET', '/students/tags', {
      ...as('mentor'),
      query: { lifecycle: 'all' },
    });
    expect(all.body.tags).toContainEqual({ tag, count: 3 });
    const other = await call('GET', '/students/tags', { ...as('otherMentor') });
    expect(other.body.tags.map((t: { tag: string }) => t.tag)).not.toContain(tag);
  });

  it('list rows carry overExpected and the stage position (sortOrder, isActive)', async () => {
    const res = await call('POST', '/students', {
      ...as('mentor'),
      body: { displayName: 'مرحله‌دار', phone: uniquePhone(), stageId: SEEDED.stages[1] },
    });
    const list = await call('GET', '/students', {
      ...as('mentor'),
      query: { q: 'مرحله‌دار' },
    });
    const row = list.body.items.find((i: { id: string }) => i.id === res.body.student.id);
    expect(row).toMatchObject({
      overExpected: 'none',
      stage: { id: SEEDED.stages[1], sortOrder: 20, isActive: true },
    });
  });
});

describe('409 PHONE_TAKEN with the existing record (sprint-2 gap 6)', () => {
  it('admin gets error.data.existingStudentId; a mentor does not', async () => {
    const phone = uniquePhone();
    const first = await call('POST', '/students', {
      ...as('mentor'),
      body: { displayName: 'تکراری', phone },
    });
    const byAdmin = await call('POST', '/students', {
      ...as('admin'),
      body: { displayName: 'تکراری دو', phone },
    });
    expect(byAdmin.status).toBe(409);
    expect(byAdmin.body.error).toMatchObject({
      code: 'PHONE_TAKEN',
      fields: { phone: expect.any(String) },
      data: { existingStudentId: first.body.student.id },
    });
    const byMentor = await call('POST', '/students', {
      ...as('otherMentor'),
      body: { displayName: 'تکراری سه', phone },
    });
    expect(byMentor.status).toBe(409);
    expect(byMentor.body.error.data).toBeUndefined();
  });
});

describe('PATCH /me/student (student edits their own whitelist)', () => {
  it('saves whitelisted fields; anything else → 422', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const cookies = (await loginAs(s)).cookies;
    const ok = await call('PATCH', '/me/student', {
      cookies,
      body: { primarySkill: 'طراحی لوگو', hoursPerWeek: '۱۵', englishWriting: 3 },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      primarySkill: 'طراحی لوگو',
      hoursPerWeek: 15,
      englishWriting: 3,
    });
    const bad = await call('PATCH', '/me/student', { cookies, body: { nicheStatement: 'x' } });
    expect(bad.status).toBe(422);
  });
});
