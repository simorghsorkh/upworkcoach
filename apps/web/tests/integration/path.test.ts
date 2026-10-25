import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { students } from '@/modules/students/schema';
import { getDb } from '@/server/db';
import { call, createUser, loginAs, SEEDED, type TestUser, uniquePhone } from './helpers';

/**
 * path module through the Route Handlers (api.md section 5, F3): stage change rules,
 * history, kanban with days in stage and warnings, "my path", stage settings.
 * Stage order and settings changes that would disturb parallel files are in
 * isolated.test.ts.
 */

let admin: TestUser;
let mentor: TestUser;
let ac: Record<string, string>;
let mc: Record<string, string>;
const S = SEEDED.stages;

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor');
  ac = (await loginAs(admin)).cookies;
  mc = (await loginAs(mentor)).cookies;
});

const changeStage = (id: string, body: unknown, cookies = mc) =>
  call('PUT', '/students/[id]/stage', { cookies, params: { id }, body });

describe('PUT /students/:id/stage (F3)', () => {
  it('advance is one call; the record shows the new stage from today', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    await getDb()
      .update(students)
      .set({ stageEnteredAt: new Date(Date.now() - 5 * 86_400_000) })
      .where(eq(students.userId, s.id));
    const res = await changeStage(s.id, {
      toStageId: S[1],
      kind: 'advance',
      note: 'جلسه‌ی آشنایی انجام شد',
    });
    expect(res.status).toBe(200);
    // Sprint 3: the seeded templates of the new stage are suggested (never created).
    expect(res.body.suggestedTemplates.map((t: { stageId: string }) => t.stageId)).toEqual([S[1]]);
    expect(res.body.student).toMatchObject({ stage: { id: S[1] }, daysInStage: 0 });
  });

  it('rules: same stage 409, wrong direction 409, note required for regress / exception 422', async () => {
    const s = await createUser('student', { mentorId: mentor.id, stageId: S[3] });
    const same = await changeStage(s.id, { toStageId: S[3], kind: 'advance' });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe('INVALID_TRANSITION');
    expect((await changeStage(s.id, { toStageId: S[1], kind: 'advance' })).status).toBe(409);
    expect((await changeStage(s.id, { toStageId: S[5], kind: 'regress', note: 'x' })).status).toBe(
      409,
    );
    const noNote = await changeStage(s.id, { toStageId: S[1], kind: 'regress' });
    expect(noNote.status).toBe(422);
    expect(noNote.body.error.fields.note).toBeDefined();
    expect(
      (await changeStage(s.id, { toStageId: S[6], kind: 'advance_with_exception', note: '  ' }))
        .status,
    ).toBe(422);

    expect((await changeStage(s.id, { toStageId: S[5], kind: 'skip_by_assessment' })).status).toBe(
      200,
    );
    expect(
      (
        await changeStage(s.id, {
          toStageId: S[2],
          kind: 'regress',
          note: 'ممیزی سه‌لایه: ویترین رد شد',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await changeStage(s.id, {
          toStageId: S[4],
          kind: 'advance_with_exception',
          note: 'با استثنا',
        })
      ).status,
    ).toBe(200);

    const history = await call('GET', '/students/[id]/stage-history', {
      cookies: mc,
      params: { id: s.id },
    });
    expect(history.status).toBe(200);
    expect(history.body.map((h: { kind: string }) => h.kind)).toEqual([
      'skip_by_assessment',
      'regress',
      'advance_with_exception',
    ]);
    expect(history.body[1]).toMatchObject({
      from: { id: S[5] },
      to: { id: S[2] },
      note: 'ممیزی سه‌لایه: ویترین رد شد',
      actor: { id: mentor.id },
    });
  });

  it('history starts with the initial transition of a student created through the API', async () => {
    const created = await call('POST', '/students', {
      cookies: mc,
      body: { displayName: 'تاریخچه', phone: uniquePhone() },
    });
    expect(created.status).toBe(201);
    const id = created.body.student.id;
    await changeStage(id, { toStageId: S[1], kind: 'advance' });
    const history = await call('GET', '/students/[id]/stage-history', {
      cookies: mc,
      params: { id },
    });
    expect(history.body.map((h: { kind: string }) => h.kind)).toEqual(['initial', 'advance']);
    expect(history.body[0].from).toBeNull();
  });
});

describe('GET /board (F3 kanban)', () => {
  it('columns per active stage; days in stage with warn / over against expectedDays', async () => {
    const tag = `کانبان-${Date.now()}`;
    const make = async (stageId: string | undefined, daysAgo: number) => {
      const s = await createUser('student', { mentorId: mentor.id, stageId });
      await getDb()
        .update(students)
        .set({
          tags: [tag],
          stageEnteredAt: new Date(Date.now() - daysAgo * 86_400_000 - 3_600_000),
        })
        .where(eq(students.userId, s.id));
      return s.id;
    };
    // Stage 1 expects 10 days.
    const fresh = await make(S[1], 2);
    const warn = await make(S[1], 12);
    const over = await make(S[1], 25);
    const growth = await make(S[8], 400);

    const res = await call('GET', '/board', { cookies: mc, query: { tag } });
    expect(res.status).toBe(200);
    const columnIds = res.body.columns.map((col: { stage: { id: string } }) => col.stage.id);
    for (const id of S) expect(columnIds).toContain(id);
    const stage1 = res.body.columns.find((col: { stage: { id: string } }) => col.stage.id === S[1]);
    expect(
      stage1.students.map((s: { id: string; overExpected: string; daysInStage: number }) => [
        s.id,
        s.overExpected,
        s.daysInStage,
      ]),
    ).toEqual([
      [over, 'over', 25],
      [warn, 'warn', 12],
      [fresh, 'none', 2],
    ]);
    const growthCol = res.body.columns.find(
      (col: { stage: { id: string } }) => col.stage.id === S[8],
    );
    expect(growthCol.students).toEqual([
      expect.objectContaining({ id: growth, overExpected: 'none', daysInStage: 400 }),
    ]);

    // Another mentor sees the same columns but none of these students.
    const otherMentor = await createUser('mentor');
    const other = await call('GET', '/board', {
      cookies: (await loginAs(otherMentor)).cookies,
      query: { tag },
    });
    expect(other.body.columns.flatMap((col: { students: unknown[] }) => col.students)).toEqual([]);
    // Admin can narrow by mentor.
    const byMentor = await call('GET', '/board', {
      cookies: ac,
      query: { tag, mentorId: mentor.id },
    });
    expect(
      byMentor.body.columns.flatMap((col: { students: unknown[] }) => col.students),
    ).toHaveLength(4);
  });
});

describe('GET /me/path (F3: current, next, content links)', () => {
  it('passed / current / locked and the next stage', async () => {
    const s = await createUser('student', { mentorId: mentor.id, stageId: S[2] });
    const res = await call('GET', '/me/path', { cookies: (await loginAs(s)).cookies });
    expect(res.status).toBe(200);
    const seeded = res.body.stages.filter((st: { id: string }) =>
      (S as readonly string[]).includes(st.id),
    );
    expect(seeded.map((st: { state: string }) => st.state)).toEqual([
      'passed',
      'passed',
      'current',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(res.body.current).toMatchObject({ id: S[2], name: 'ساخت ویترین', contentLinks: [] });
    expect(res.body.next).toMatchObject({ id: S[3] });
    expect(res.body.current).not.toHaveProperty('expectedDays');
  });

  it('the last stage has no next; staff get 403', async () => {
    const s = await createUser('student', { stageId: S[8] });
    const res = await call('GET', '/me/path', { cookies: (await loginAs(s)).cookies });
    expect(res.body.next === null || !(S as readonly string[]).includes(res.body.next.id)).toBe(
      true,
    );
    expect((await call('GET', '/me/path', { cookies: mc })).status).toBe(403);
  });
});

describe('stage settings (admin, F11)', () => {
  it('create, edit with content links (https only), deactivate (409 with active students), reactivate', async () => {
    const created = await call('POST', '/stages', {
      cookies: ac,
      body: { displayCode: '۹', name: 'مرحله‌ی تازه', expectedDays: '۷', sortOrder: 5_000 },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ expectedDays: 7, isActive: true, isOpenEnded: false });
    const id = created.body.id;

    const bad = await call('PATCH', '/stages/[id]', {
      cookies: ac,
      params: { id },
      body: { contentLinks: [{ title: 'ویدئو', url: 'javascript:alert(1)' }] },
    });
    expect(bad.status).toBe(422);
    const edited = await call('PATCH', '/stages/[id]', {
      cookies: ac,
      params: { id },
      body: {
        name: 'مرحله‌ی ویرایش‌شده',
        contentLinks: [{ title: 'ویدئوی مرحله', url: 'https://example.com/v' }],
        studentDescription: 'شرح برای هنرجو',
      },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.contentLinks).toEqual([
      { title: 'ویدئوی مرحله', url: 'https://example.com/v' },
    ]);
    expect(
      (
        await call('PATCH', '/stages/[id]', {
          cookies: ac,
          params: { id },
          body: { isActive: false },
        })
      ).status,
    ).toBe(422);
    expect(
      (await call('PATCH', '/stages/[id]', { cookies: mc, params: { id }, body: { name: 'x' } }))
        .status,
    ).toBe(403);

    const s = await createUser('student', { stageId: id });
    const blocked = await call('POST', '/stages/[id]/deactivate', { cookies: ac, params: { id } });
    expect(blocked.status).toBe(409);
    await getDb()
      .update(students)
      .set({ lifecycleStatus: 'graduated' })
      .where(eq(students.userId, s.id));
    const deactivated = await call('POST', '/stages/[id]/deactivate', {
      cookies: ac,
      params: { id },
    });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.isActive).toBe(false);

    const listed = await call('GET', '/stages', { cookies: ac });
    expect(listed.body.map((st: { id: string }) => st.id)).not.toContain(id);
    const withInactive = await call('GET', '/stages', {
      cookies: ac,
      query: { includeInactive: '1' },
    });
    expect(withInactive.body.map((st: { id: string }) => st.id)).toContain(id);

    // An inactive stage cannot be a target.
    const mover = await createUser('student', { mentorId: mentor.id });
    const res = await changeStage(mover.id, { toStageId: id, kind: 'advance' });
    expect(res.status).toBe(422);

    const reactivated = await call('PATCH', '/stages/[id]', {
      cookies: ac,
      params: { id },
      body: { isActive: true },
    });
    expect(reactivated.body.isActive).toBe(true);
    await call('POST', '/stages/[id]/deactivate', { cookies: ac, params: { id } });
  });

  it('PUT /stages/order needs exactly the full set of stage ids (422 otherwise)', async () => {
    const res = await call('PUT', '/stages/order', {
      cookies: ac,
      body: { stageIds: [S[1], S[0]] },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.stageIds).toBeDefined();
  });
});
