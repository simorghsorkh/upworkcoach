import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { auditLog } from '@/modules/admin/schema';
import { notes, timelineEvents } from '@/modules/timeline/schema';
import { getDb } from '@/server/db';
import { ROUTES } from '@/server/http/routes.manifest';
import { noteFixture, reviewFixture, taskFixture } from './fixtures';
import { call, createUser, loginAs, SEEDED, type TestUser, uniquePhone } from './helpers';

/**
 * Notes and the record timeline (PRD F5, api.md section 7, ADR-0004 section 3-4).
 * The explicit F5 acceptance test: an internal note is in NO student-side response.
 */

const CANARY = 'CANARY-INTERNAL-7f3a';
const MISSING = '01900000-0000-7000-8000-00000000c0de';

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

const as = (who: string) => ({ cookies: c[who] });

const createNote = (who: string, studentId: string, body: Record<string, unknown>) =>
  call('POST', '/students/[id]/notes', { ...as(who), params: { id: studentId }, body });

describe('notes (F5)', () => {
  it('default visibility is internal; kind, tags and a past time can be set', async () => {
    const res = await createNote('mentor', student.id, { body: 'تماس تلفنی کوتاه' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      visibility: 'internal',
      kind: 'note',
      author: { id: mentor.id },
      canEdit: true,
    });
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString();
    const session = await createNote('mentor', student.id, {
      body: 'جلسه‌ی ۱:۱',
      kind: 'session',
      visibility: 'shared',
      tags: ['انگیزه', 'انگیزه'],
      occurredAt: yesterday,
    });
    expect(session.body).toMatchObject({ kind: 'session', visibility: 'shared', tags: ['انگیزه'] });
    expect(session.body.occurredAt).toBe(yesterday.replace(/\.\d+Z$/, (m) => m));
    const future = await createNote('mentor', student.id, {
      body: 'x',
      occurredAt: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(),
    });
    expect(future.status).toBe(422);
  });

  it('only the author (in scope) or an admin edits/deletes; others get 404', async () => {
    const id = await noteFixture(student.id, mentor.id);
    const missing = await call('PATCH', '/notes/[id]', {
      ...as('otherMentor'),
      params: { id: MISSING },
      body: { body: 'x' },
    });
    const foreign = await call('PATCH', '/notes/[id]', {
      ...as('otherMentor'),
      params: { id },
      body: { body: 'x' },
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    // A note by the admin: the mentor sees it (canEdit false) but cannot edit it.
    const byAdmin = await noteFixture(student.id, admin.id);
    expect(
      (
        await call('PATCH', '/notes/[id]', {
          ...as('mentor'),
          params: { id: byAdmin },
          body: { body: 'x' },
        })
      ).status,
    ).toBe(404);
    const list = await call('GET', '/students/[id]/notes', {
      ...as('mentor'),
      params: { id: student.id },
    });
    expect(list.body.items.find((n: { id: string }) => n.id === byAdmin).canEdit).toBe(false);
    expect(
      (
        await call('PATCH', '/notes/[id]', {
          ...as('admin'),
          params: { id },
          body: { body: 'ویرایش مدیر' },
        })
      ).body.body,
    ).toBe('ویرایش مدیر');
    expect((await call('DELETE', '/notes/[id]', { ...as('mentor'), params: { id } })).status).toBe(
      204,
    );
    // Deleted = gone for everybody.
    expect((await call('DELETE', '/notes/[id]', { ...as('admin'), params: { id } })).status).toBe(
      404,
    );
  });

  it('internal → shared is audited (SEC-L7); ifUpdatedAt conflicts → 409', async () => {
    const created = await createNote('mentor', student.id, { body: 'به هنرجو بگو' });
    const stale = await call('PATCH', '/notes/[id]', {
      ...as('mentor'),
      params: { id: created.body.id },
      body: { body: 'x', ifUpdatedAt: '2020-01-01T00:00:00Z' },
    });
    expect(stale.status).toBe(409);
    const shared = await call('PATCH', '/notes/[id]', {
      ...as('mentor'),
      params: { id: created.body.id },
      body: { visibility: 'shared', ifUpdatedAt: created.body.updatedAt },
    });
    expect(shared.body.visibility).toBe('shared');
    const audits = await getDb()
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(
        and(eq(auditLog.action, 'note.visibility_changed'), eq(auditLog.targetId, created.body.id)),
      );
    expect(audits).toHaveLength(1);
  });

  it('M-former: after a mentor change the old author loses the note (404)', async () => {
    const moved = await createUser('student', { mentorId: mentor.id });
    const id = await noteFixture(moved.id, mentor.id);
    await call('PUT', '/students/[id]/mentor', {
      ...as('admin'),
      params: { id: moved.id },
      body: { mentorId: otherMentor.id },
    });
    for (const [method, path, body] of [
      ['PATCH', '/notes/[id]', { body: 'x' }],
      ['DELETE', '/notes/[id]', undefined],
    ] as const) {
      expect((await call(method, path, { ...as('mentor'), params: { id }, body })).status).toBe(
        404,
      );
    }
    expect(
      (await call('GET', '/students/[id]/notes', { ...as('mentor'), params: { id: moved.id } }))
        .status,
    ).toBe(404);
  });
});

describe('an internal note never reaches the student (F5 acceptance, T-CANARY)', () => {
  it('no student GET response contains the internal note, its tags or a deleted shared note', async () => {
    const internal = await createNote('mentor', student.id, {
      body: `${CANARY} مشکل مالی دارد`,
      tags: [CANARY],
    });
    expect(internal.status).toBe(201);
    const deleted = await createNote('mentor', student.id, {
      body: `${CANARY}-deleted`,
      visibility: 'shared',
    });
    await call('DELETE', '/notes/[id]', { ...as('mentor'), params: { id: deleted.body.id } });
    const shared = await createNote('mentor', student.id, {
      body: 'این هفته روی پروپوزال کار کن.',
      visibility: 'shared',
    });
    await createUser('student'); // unrelated data must not matter
    const { taskId } = await reviewFixture(student.id, mentor.id);

    const studentGets = ROUTES.filter(
      (r) =>
        r.method === 'GET' &&
        (r.access === 'any' || (Array.isArray(r.access) && r.access.includes('student'))) &&
        !r.path.includes('[id]'),
    );
    expect(studentGets.map((r) => r.path)).toContain('/me/shared-notes');
    for (const entry of studentGets) {
      const res = await call('GET', entry.path, { ...as('student') });
      expect(res.status).toBeLessThan(400);
      expect(JSON.stringify(res.body)).not.toContain(CANARY);
    }
    const own = await call('GET', '/tasks/[id]', { ...as('student'), params: { id: taskId } });
    expect(JSON.stringify(own.body)).not.toContain(CANARY);

    const mine = await call('GET', '/me/shared-notes', { ...as('student') });
    const sharedSchema = z.strictObject({
      id: z.string(),
      kind: z.string(),
      body: z.string(),
      occurredAt: z.string(),
      author: z.strictObject({ displayName: z.string() }),
    });
    for (const item of mine.body.items) sharedSchema.parse(item);
    const ids = mine.body.items.map((n: { id: string }) => n.id);
    expect(ids).toContain(shared.body.id);
    expect(ids).not.toContain(internal.body.id);
    expect(ids).not.toContain(deleted.body.id);
    // Staff routes stay closed to the student.
    expect(
      (await call('GET', '/students/[id]/notes', { ...as('student'), params: { id: student.id } }))
        .status,
    ).toBe(403);
    expect(
      (
        await call('GET', '/students/[id]/timeline', {
          ...as('student'),
          params: { id: student.id },
        })
      ).status,
    ).toBe(403);
  });

  it('initialNote of POST /students is an internal note', async () => {
    const res = await call('POST', '/students', {
      ...as('admin'),
      body: { displayName: 'هنرجوی تازه', phone: uniquePhone(), initialNote: `${CANARY} اول` },
    });
    expect(res.status).toBe(201);
    const rows = await getDb()
      .select({ visibility: notes.visibility, body: notes.body })
      .from(notes)
      .where(eq(notes.studentId, res.body.student.id));
    expect(rows).toEqual([{ visibility: 'internal', body: `${CANARY} اول` }]);
  });
});

describe('record timeline (GET /students/:id/timeline)', () => {
  it('merges events and notes newest first, with refs, a category filter and a cursor', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    await call('PUT', '/students/[id]/stage', {
      ...as('mentor'),
      params: { id: s.id },
      body: { toStageId: SEEDED.stages[1], kind: 'advance' },
    });
    await call('POST', '/students/[id]/profiles', {
      ...as('mentor'),
      params: { id: s.id },
      body: { platformId: SEEDED.platforms.upwork, kind: 'profile' },
    });
    await call('POST', '/students/[id]/tasks', {
      ...as('mentor'),
      params: { id: s.id },
      body: { title: 'کار تایم‌لاین' },
    });
    await createNote('mentor', s.id, { body: 'یادداشت تایم‌لاین' });

    const all = await call('GET', '/students/[id]/timeline', {
      ...as('mentor'),
      params: { id: s.id },
    });
    expect(all.status).toBe(200);
    const types = all.body.items.map((i: { type: string }) => i.type);
    expect(types).toEqual(['note', 'task.created', 'profile.added', 'stage.changed']);
    const stage = all.body.items.find((i: { type: string }) => i.type === 'stage.changed');
    expect(all.body.refs.stages[stage.data.to]).toMatchObject({ displayCode: '۱' });
    expect(all.body.items[0]).toMatchObject({ kind: 'note', category: 'note' });
    const times = all.body.items.map((i: { occurredAt: string }) => i.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);

    const onlyNotes = await call('GET', '/students/[id]/timeline', {
      ...as('mentor'),
      params: { id: s.id },
      query: { types: 'note' },
    });
    expect(onlyNotes.body.items.map((i: { kind: string }) => i.kind)).toEqual(['note']);
    const stageOnly = await call('GET', '/students/[id]/timeline', {
      ...as('mentor'),
      params: { id: s.id },
      query: { types: 'stage,profile' },
    });
    expect(stageOnly.body.items.map((i: { type: string }) => i.type)).toEqual([
      'profile.added',
      'stage.changed',
    ]);
    expect(
      (
        await call('GET', '/students/[id]/timeline', {
          ...as('mentor'),
          params: { id: s.id },
          query: { types: 'secret' },
        })
      ).status,
    ).toBe(422);

    const page1 = await call('GET', '/students/[id]/timeline', {
      ...as('mentor'),
      params: { id: s.id },
      query: { limit: '3' },
    });
    expect(page1.body.items).toHaveLength(3);
    const page2 = await call('GET', '/students/[id]/timeline', {
      ...as('mentor'),
      params: { id: s.id },
      query: { limit: '3', cursor: page1.body.nextCursor },
    });
    expect(page2.body.items.map((i: { type: string }) => i.type)).toEqual(['stage.changed']);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('recordTimelineEvent writes the sprint-2 events too (student.created, mentor.changed)', async () => {
    const res = await call('POST', '/students', {
      ...as('admin'),
      body: { displayName: 'رویداد', phone: uniquePhone(), mentorId: mentor.id },
    });
    const id = res.body.student.id as string;
    await call('PUT', '/students/[id]/mentor', {
      ...as('admin'),
      params: { id },
      body: { mentorId: otherMentor.id },
    });
    const events = await getDb()
      .select({ type: timelineEvents.type, data: timelineEvents.data })
      .from(timelineEvents)
      .where(eq(timelineEvents.studentId, id));
    expect(events.map((e) => e.type).sort()).toEqual(['mentor.changed', 'student.created']);
    const timeline = await call('GET', '/students/[id]/timeline', {
      ...as('admin'),
      params: { id },
    });
    expect(timeline.body.refs.users[otherMentor.id]).toBeDefined();
  });

  it('timeline of a task: submission and review events are in the task category', async () => {
    const id = await taskFixture(student.id, mentor.id);
    await call('POST', '/tasks/[id]/submissions', {
      ...as('student'),
      params: { id },
      body: { bodyText: 'تحویل' },
    });
    const res = await call('GET', '/students/[id]/timeline', {
      ...as('mentor'),
      params: { id: student.id },
      query: { types: 'task' },
    });
    const types = res.body.items.map((i: { type: string }) => i.type);
    expect(types).toContain('submission.created');
    expect(types).toContain('task.status_changed');
    expect(res.body.items.every((i: { category: string }) => i.category === 'task')).toBe(true);
  });
});
