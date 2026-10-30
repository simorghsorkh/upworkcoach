import { and, eq, inArray } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { tehranDayEnd } from '@/lib/tehran-day';
import { taskTemplates } from '@/modules/catalog/schema';
import { DEFAULT_ORGANIZATION_ID } from '@/modules/identity/schema';
import { platformProfiles, students } from '@/modules/students/schema';
import { reviews, taskExtensions, tasks } from '@/modules/tasks/schema';
import { timelineEvents } from '@/modules/timeline/schema';
import { getDb } from '@/server/db';
import { dayFromToday, questionFixture, submittedTaskFixture, taskFixture } from './fixtures';
import { call, createUser, loginAs, SEEDED, type TestUser } from './helpers';

/**
 * Sprint-3 frontend gaps, closed in sprint 4 (sprint-4.md "Gaps closed"):
 * 1. GET /tasks across students (scope matrix incl. M-other / M-former, filters, counts,
 *    cursor); 2. reviewer display name in the student review; 3. `nextDueDate` in a review;
 * 4. atomic tasks on a stage change; 5. `submissionType` / `dueAt` in the review queue;
 * 6. platform name in profile events; 7. typed `unansweredQuestions` in "Today".
 */

const S = SEEDED.stages;
const MISSING = '01900000-0000-7000-8000-00000000cafe';

let admin: TestUser;
let mentor: TestUser;
let otherMentor: TestUser;
let student: TestUser;
let student2: TestUser;
let otherStudent: TestUser;
const c: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  admin = await createUser('admin', { displayName: 'مدیر شکاف‌ها' });
  mentor = await createUser('mentor', { displayName: 'رضا مشاور' });
  otherMentor = await createUser('mentor');
  student = await createUser('student', { mentorId: mentor.id, displayName: 'هنرجوی الف' });
  student2 = await createUser('student', { mentorId: mentor.id, displayName: 'هنرجوی ب' });
  otherStudent = await createUser('student', { mentorId: otherMentor.id });
  for (const [key, user] of Object.entries({
    admin,
    mentor,
    otherMentor,
    student,
    otherStudent,
  })) {
    c[key] = (await loginAs(user)).cookies;
  }
});

const as = (who: string) => ({ cookies: c[who] });
type TaskItem = { id: string; status: string; student: { id: string }; overdue: boolean };
const ids = (body: { items: TaskItem[] }) => body.items.map((t) => t.id);

describe('gap 1 — GET /tasks (staff, across students)', () => {
  let mine: string[];
  let others: string;
  let overdueId: string;
  let submittedId: string;

  beforeAll(async () => {
    overdueId = await taskFixture(student.id, mentor.id, {
      title: 'GAP1 معوق',
      dueAt: new Date(Date.now() - 3 * 86_400_000),
    });
    submittedId = (await submittedTaskFixture(student2.id, mentor.id)).taskId;
    mine = [
      overdueId,
      submittedId,
      await taskFixture(student.id, mentor.id, { title: 'GAP1 باز', submissionType: 'link' }),
      await taskFixture(student2.id, admin.id, { title: 'GAP1 پذیرفته', status: 'accepted' }),
    ];
    others = await taskFixture(otherStudent.id, otherMentor.id, { title: 'GAP1 دیگری' });
  });

  it('matrix: A sees every scope, M only own students; S → 403; anonymous → 401', async () => {
    const adminList = await call('GET', '/tasks', {
      ...as('admin'),
      query: { limit: '100', q: 'GAP1' },
    });
    expect(adminList.status).toBe(200);
    expect(ids(adminList.body)).toEqual(expect.arrayContaining([...mine.slice(0, 1), others]));

    const mentorList = await call('GET', '/tasks', {
      ...as('mentor'),
      query: { limit: '100' },
    });
    expect(mentorList.status).toBe(200);
    expect(ids(mentorList.body)).toEqual(expect.arrayContaining(mine));
    expect(ids(mentorList.body)).not.toContain(others);
    expect(
      mentorList.body.items.every((t: TaskItem) =>
        [student.id, student2.id].includes(t.student.id),
      ),
    ).toBe(true);

    const otherList = await call('GET', '/tasks', {
      ...as('otherMentor'),
      query: { limit: '100' },
    });
    expect(ids(otherList.body)).toContain(others);
    for (const id of mine) expect(ids(otherList.body)).not.toContain(id);

    expect((await call('GET', '/tasks', as('student'))).status).toBe(403);
    expect((await call('GET', '/tasks', {})).status).toBe(401);
  });

  it('filters outside the scope only give an empty list (studentId, mentorId, reviewerId)', async () => {
    const queries: Array<Record<string, string>> = [
      { studentId: otherStudent.id },
      { mentorId: otherMentor.id },
      { reviewerId: otherMentor.id },
      { studentId: MISSING },
    ];
    for (const query of queries) {
      const res = await call('GET', '/tasks', { ...as('mentor'), query });
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.counts.total).toBe(0);
    }
  });

  it('M-former: after a mentor change the former mentor no longer lists the tasks', async () => {
    const moved = await createUser('student', { mentorId: otherMentor.id });
    const taskId = await taskFixture(moved.id, otherMentor.id);
    const before = await call('GET', '/tasks', {
      ...as('otherMentor'),
      query: { studentId: moved.id },
    });
    expect(ids(before.body)).toEqual([taskId]);
    const change = await call('PUT', '/students/[id]/mentor', {
      ...as('admin'),
      params: { id: moved.id },
      body: { mentorId: mentor.id },
    });
    expect(change.status).toBe(200);
    const after = await call('GET', '/tasks', {
      ...as('otherMentor'),
      query: { studentId: moved.id },
    });
    expect(after.body.items).toEqual([]);
    const now = await call('GET', '/tasks', { ...as('mentor'), query: { studentId: moved.id } });
    expect(ids(now.body)).toEqual([taskId]);
  });

  it('status, overdue, reviewer, type and search filters; counts ignore status/overdue', async () => {
    const q = { studentId: student.id };
    const overdue = await call('GET', '/tasks', {
      ...as('mentor'),
      query: { ...q, overdue: '1' },
    });
    expect(ids(overdue.body)).toEqual([overdueId]);
    expect(overdue.body.items[0].overdue).toBe(true);

    const all = await call('GET', '/tasks', { ...as('mentor'), query: q });
    expect(overdue.body.counts).toEqual(all.body.counts);
    expect(all.body.counts.total).toBe(all.body.items.length);
    expect(all.body.counts.overdue).toBe(1);
    expect(all.body.counts.byStatus.open).toBe(2);
    expect(Object.keys(all.body.counts.byStatus).sort()).toEqual(
      ['accepted', 'cancelled', 'changes_requested', 'in_progress', 'open', 'submitted'].sort(),
    );

    const submitted = await call('GET', '/tasks', {
      ...as('mentor'),
      query: { status: 'submitted', mentorId: mentor.id },
    });
    expect(ids(submitted.body)).toContain(submittedId);
    expect(submitted.body.items.every((t: TaskItem) => t.status === 'submitted')).toBe(true);

    const byReviewer = await call('GET', '/tasks', {
      ...as('admin'),
      query: { reviewerId: admin.id, studentId: student2.id },
    });
    expect(byReviewer.body.items.map((t: { title: string }) => t.title)).toEqual(['GAP1 پذیرفته']);

    const links = await call('GET', '/tasks', {
      ...as('mentor'),
      query: { ...q, submissionType: 'link' },
    });
    expect(links.body.items.map((t: { title: string }) => t.title)).toEqual(['GAP1 باز']);

    // Search by title and by the student's name (Arabic ي/ك are unified).
    const byTitle = await call('GET', '/tasks', { ...as('mentor'), query: { q: 'GAP1 معوق' } });
    expect(ids(byTitle.body)).toEqual([overdueId]);
    const byName = await call('GET', '/tasks', {
      ...as('mentor'),
      query: { q: 'هنرجوي ب', status: 'accepted,submitted' },
    });
    expect(ids(byName.body).sort()).toEqual([submittedId, mine[3]].sort());
  });

  it('cursor pagination by deadline; malformed cursor or unknown key → 422', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await call('GET', '/tasks', {
        ...as('mentor'),
        query: { studentId: student.id, limit: '1', ...(cursor ? { cursor } : {}) },
      });
      expect(res.status).toBe(200);
      seen.push(...ids(res.body));
      cursor = res.body.nextCursor ?? undefined;
      if (!cursor) break;
    }
    const full = await call('GET', '/tasks', { ...as('mentor'), query: { studentId: student.id } });
    expect(seen).toEqual(ids(full.body));
    const dues = full.body.items.map((t: { dueAt: string }) => t.dueAt);
    expect([...dues].sort()).toEqual(dues);

    expect(
      (await call('GET', '/tasks', { ...as('mentor'), query: { cursor: 'not-a-cursor' } })).status,
    ).toBe(422);
    expect((await call('GET', '/tasks', { ...as('mentor'), query: { foo: '1' } })).status).toBe(
      422,
    );
    expect((await call('GET', '/tasks', { ...as('mentor'), query: { status: 'x' } })).status).toBe(
      422,
    );
  });
});

describe('gap 2 — reviewer display name in the student review', () => {
  it('the student sees who reviewed (name only, no id)', async () => {
    const { taskId, submissionId } = await submittedTaskFixture(student.id, mentor.id);
    const review = await call('POST', '/submissions/[id]/review', {
      ...as('admin'),
      params: { id: submissionId },
      body: { outcome: 'accepted', feedbackText: 'خوب بود' },
    });
    expect(review.status).toBe(201);
    const own = await call('GET', '/tasks/[id]', { ...as('student'), params: { id: taskId } });
    expect(own.body.submissions[0].review.reviewer).toEqual({ displayName: 'مدیر شکاف‌ها' });
    expect(JSON.stringify(own.body)).not.toContain(admin.id);
    expect(JSON.stringify(own.body)).not.toContain('"reviewerId"');
  });
});

describe('gap 3 — nextDueDate in a review', () => {
  it('changes_requested + nextDueDate: new deadline, not an extension, recorded in the event', async () => {
    const { taskId, submissionId } = await submittedTaskFixture(student.id, mentor.id);
    const before = await getDb()
      .select({ dueAt: tasks.dueAt })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    const day = dayFromToday(5);
    const res = await call('POST', '/submissions/[id]/review', {
      ...as('mentor'),
      params: { id: submissionId },
      body: { outcome: 'changes_requested', feedbackText: 'اصلاح کن', nextDueDate: day },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'changes_requested',
      dueAt: tehranDayEnd(day).toISOString(),
      extensionCount: 0,
      revisionCount: 1,
      extensions: [],
    });
    expect(
      await getDb().select().from(taskExtensions).where(eq(taskExtensions.taskId, taskId)),
    ).toEqual([]);
    const events = await getDb()
      .select({ data: timelineEvents.data })
      .from(timelineEvents)
      .where(
        and(eq(timelineEvents.type, 'review.created'), eq(timelineEvents.studentId, student.id)),
      );
    const mine = events.find((e) => (e.data as { taskId?: string }).taskId === taskId);
    expect(mine?.data).toMatchObject({
      previousDueAt: before[0]?.dueAt.toISOString(),
      nextDueAt: tehranDayEnd(day).toISOString(),
    });
  });

  it('an overdue task is no longer overdue after a review with a new deadline', async () => {
    const { taskId, submissionId } = await submittedTaskFixture(student.id, mentor.id);
    await getDb()
      .update(tasks)
      .set({ dueAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(tasks.id, taskId));
    const res = await call('POST', '/submissions/[id]/review', {
      ...as('mentor'),
      params: { id: submissionId },
      body: { outcome: 'changes_requested', feedbackText: 'x', nextDueDate: dayFromToday(0) },
    });
    expect(res.status).toBe(201);
    expect(res.body.overdue).toBe(false);
  });

  it('with accepted, or before today → 422 and nothing is written', async () => {
    for (const body of [
      { outcome: 'accepted', feedbackText: 'x', nextDueDate: dayFromToday(3) },
      { outcome: 'changes_requested', feedbackText: 'x', nextDueDate: dayFromToday(-1) },
      { outcome: 'changes_requested', feedbackText: 'x', nextDueDate: '1405/08/01' },
    ]) {
      const { taskId, submissionId } = await submittedTaskFixture(student.id, mentor.id);
      const res = await call('POST', '/submissions/[id]/review', {
        ...as('mentor'),
        params: { id: submissionId },
        body,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.fields).toHaveProperty('nextDueDate');
      const [row] = await getDb()
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, taskId));
      expect(row?.status).toBe('submitted');
      expect(
        await getDb().select().from(reviews).where(eq(reviews.submissionId, submissionId)),
      ).toEqual([]);
    }
  });
});

describe('gap 4 — tasks of a stage change, atomic', () => {
  const changeStage = (id: string, body: unknown) =>
    call('PUT', '/students/[id]/stage', { ...as('mentor'), params: { id }, body });

  async function snapshot(studentId: string) {
    const [s] = await getDb()
      .select({ stage: students.currentStageId })
      .from(students)
      .where(eq(students.userId, studentId));
    const rows = await getDb()
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.studentId, studentId));
    const stageEvents = await getDb()
      .select({ id: timelineEvents.id })
      .from(timelineEvents)
      .where(
        and(eq(timelineEvents.studentId, studentId), eq(timelineEvents.type, 'stage.changed')),
      );
    return { stage: s?.stage, tasks: rows.sort((a, b) => a.id.localeCompare(b.id)), stageEvents };
  }

  it('creates the chosen templates and cancels the chosen tasks in the same transaction', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const keep = await taskFixture(s.id, mentor.id, { title: 'بماند' });
    const drop = await taskFixture(s.id, mentor.id, { title: 'لغو شود' });
    const res = await changeStage(s.id, {
      toStageId: S[1],
      kind: 'advance',
      createTemplateIds: [
        SEEDED.taskTemplates[0],
        SEEDED.taskTemplates[1],
        SEEDED.taskTemplates[0],
      ],
      cancelTaskIds: [drop],
    });
    expect(res.status).toBe(200);
    expect(res.body.student.stage.id).toBe(S[1]);
    expect(res.body.createdTasks.map((t: { templateId: string }) => t.templateId)).toEqual([
      SEEDED.taskTemplates[0],
      SEEDED.taskTemplates[1],
    ]);
    expect(res.body.createdTasks[0]).toMatchObject({
      student: { id: s.id },
      reviewer: { id: mentor.id },
      status: 'open',
    });
    expect(res.body.cancelledTaskIds).toEqual([drop]);
    const rows = await getDb()
      .select({ id: tasks.id, status: tasks.status, cancelReason: tasks.cancelReason })
      .from(tasks)
      .where(inArray(tasks.id, [keep, drop]));
    expect(rows.find((r) => r.id === keep)?.status).toBe('open');
    expect(rows.find((r) => r.id === drop)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'با تغییر مرحله لغو شد.',
    });
  });

  it('without the new fields the response still has both lists (empty)', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const res = await changeStage(s.id, { toStageId: S[1], kind: 'advance' });
    expect(res.status).toBe(200);
    expect(res.body.createdTasks).toEqual([]);
    expect(res.body.cancelledTaskIds).toEqual([]);
  });

  it('one invalid template (inactive or missing) → 422; nothing created, cancelled or moved', async () => {
    const [inactive] = await getDb()
      .insert(taskTemplates)
      .values({
        organizationId: DEFAULT_ORGANIZATION_ID,
        title: 'قالب غیرفعال شکاف ۴',
        isActive: false,
      })
      .returning({ id: taskTemplates.id });
    for (const bad of [inactive?.id ?? '', MISSING]) {
      const s = await createUser('student', { mentorId: mentor.id });
      const open = await taskFixture(s.id, mentor.id);
      const before = await snapshot(s.id);
      const res = await changeStage(s.id, {
        toStageId: S[1],
        kind: 'advance',
        createTemplateIds: [SEEDED.taskTemplates[0], bad],
        cancelTaskIds: [open],
      });
      expect(res.status).toBe(422);
      expect(res.body.error.fields).toEqual({ createTemplateIds: 'مقدار نامعتبر است' });
      expect(await snapshot(s.id)).toEqual(before);
    }
  });

  it('a task of another student or a final task → refused; nothing changes', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const open = await taskFixture(s.id, mentor.id);
    const accepted = await taskFixture(s.id, mentor.id, { status: 'accepted' });
    const foreign = await taskFixture(student.id, mentor.id);
    const before = await snapshot(s.id);

    const other = await changeStage(s.id, {
      toStageId: S[1],
      kind: 'advance',
      createTemplateIds: [SEEDED.taskTemplates[0]],
      cancelTaskIds: [open, foreign],
    });
    expect(other.status).toBe(422);
    expect(other.body.error.fields).toEqual({ cancelTaskIds: 'مقدار نامعتبر است' });

    const final = await changeStage(s.id, {
      toStageId: S[1],
      kind: 'advance',
      createTemplateIds: [SEEDED.taskTemplates[0]],
      cancelTaskIds: [open, accepted],
    });
    expect(final.status).toBe(409);
    expect(final.body.error.code).toBe('INVALID_TRANSITION');

    expect(await snapshot(s.id)).toEqual(before);
    const [f] = await getDb()
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, foreign));
    expect(f?.status).toBe('open');
  });

  it('a failed stage rule (same stage) also rolls back the task part', async () => {
    const s = await createUser('student', { mentorId: mentor.id, stageId: S[2] });
    const open = await taskFixture(s.id, mentor.id);
    const before = await snapshot(s.id);
    const res = await changeStage(s.id, {
      toStageId: S[2],
      kind: 'advance',
      createTemplateIds: [SEEDED.taskTemplates[0]],
      cancelTaskIds: [open],
    });
    expect(res.status).toBe(409);
    expect(await snapshot(s.id)).toEqual(before);
  });
});

describe('gap 5 — review queue items carry submissionType and dueAt', () => {
  it('GET /review-queue', async () => {
    const { taskId } = await submittedTaskFixture(student.id, mentor.id);
    const [row] = await getDb()
      .select({ dueAt: tasks.dueAt, submissionType: tasks.submissionType })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    const res = await call('GET', '/review-queue', as('mentor'));
    const item = res.body.find((i: { taskId: string }) => i.taskId === taskId);
    expect(item).toMatchObject({
      submissionType: row?.submissionType,
      dueAt: row?.dueAt.toISOString(),
    });
  });
});

describe('gap 6 — platform name in profile events', () => {
  it('profile.added / updated / approved / removed keep the platform name', async () => {
    const created = await call('POST', '/students/[id]/profiles', {
      ...as('mentor'),
      params: { id: student2.id },
      body: { platformId: SEEDED.platforms.upwork, kind: 'profile' },
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const platformName = created.body.platform.name as string;
    expect(
      (
        await call('PATCH', '/profiles/[id]', {
          ...as('mentor'),
          params: { id },
          body: { headline: 'Gap 6' },
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('POST', '/profiles/[id]/approve', { ...as('mentor'), params: { id } })).status,
    ).toBe(200);
    expect(
      (await call('DELETE', '/profiles/[id]', { ...as('mentor'), params: { id } })).status,
    ).toBe(204);
    const events = await getDb()
      .select({ type: timelineEvents.type, data: timelineEvents.data })
      .from(timelineEvents)
      .where(and(eq(timelineEvents.subjectType, 'profile'), eq(timelineEvents.subjectId, id)));
    expect(events.map((e) => e.type).sort()).toEqual(
      ['profile.added', 'profile.approved', 'profile.removed', 'profile.updated'].sort(),
    );
    for (const e of events) {
      expect(e.data).toMatchObject({
        platformId: SEEDED.platforms.upwork,
        platformName,
        kind: 'profile',
      });
    }
    expect(events.find((e) => e.type === 'profile.updated')?.data).toMatchObject({
      fields: ['headline'],
    });
    // Still readable through the timeline after the showcase is gone.
    const timeline = await call('GET', '/students/[id]/timeline', {
      ...as('mentor'),
      params: { id: student2.id },
      query: { types: 'profile' },
    });
    const removed = timeline.body.items.find(
      (i: { type?: string }) => i.type === 'profile.removed',
    );
    expect(removed?.data?.platformName).toBe(platformName);
    const [p] = await getDb()
      .select({ deletedAt: platformProfiles.deletedAt })
      .from(platformProfiles)
      .where(eq(platformProfiles.id, id));
    expect(p?.deletedAt).not.toBeNull();
  });
});

describe('gap 7 — «امروز» unansweredQuestions is typed and filled', () => {
  it('a thread awaiting the team appears with the StaffQuestionListItemDTO shape', async () => {
    const threadId = await questionFixture(student.id, mentor.id, { subject: 'GAP7' });
    const res = await call('GET', '/today', as('mentor'));
    expect(res.status).toBe(200);
    const item = res.body.unansweredQuestions.find((q: { id: string }) => q.id === threadId);
    expect(item).toMatchObject({
      id: threadId,
      subject: 'GAP7',
      student: { id: student.id },
      assignee: { id: mentor.id },
    });
  });
});
