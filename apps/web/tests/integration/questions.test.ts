import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { questionThreads } from '@/modules/questions/schema';
import { getDb } from '@/server/db';
import { formWith, imageBytes, noteFixture, questionFixture, taskFixture } from './fixtures';
import { call, createUser, loginAs, SEEDED, type TestUser } from './helpers';

/**
 * Questions (PRD F8, api.md section 10, ADR-0004 "Questions note", SEC-A8): the thread life
 * cycle, the SLA, the out-of-scope assignee (only that thread and the summary, only while
 * open), reference ids (T-REF), mentor change, "Today", and the student DTO.
 */

const CANARY = 'CANARY-QUESTION-5d1e';
const MISSING = '01900000-0000-7000-8000-00000000cafe';

let admin: TestUser;
let mentor: TestUser;
let assigneeMentor: TestUser;
let otherMentor: TestUser;
let student: TestUser;
let otherStudent: TestUser;
const c: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor');
  assigneeMentor = await createUser('mentor');
  otherMentor = await createUser('mentor');
  student = await createUser('student', { mentorId: mentor.id });
  otherStudent = await createUser('student', { mentorId: otherMentor.id });
  for (const [key, user] of Object.entries({
    admin,
    mentor,
    assigneeMentor,
    otherMentor,
    student,
    otherStudent,
  })) {
    c[key] = (await loginAs(user)).cookies;
  }
});

const as = (who: string) => ({ cookies: c[who] ?? {} });

async function ask(who: string, body: Record<string, unknown>) {
  return call('POST', '/me/questions', { ...as(who), body });
}

describe('thread life cycle (F8)', () => {
  it('student asks → assigned to the primary mentor, awaiting the team, SLA running', async () => {
    const res = await ask('student', {
      subject: 'قیمت اولین پروژه',
      body: 'برای اولین پروژه چه نرخی بگذارم؟',
      links: [{ url: 'https://example.com/job' }],
      priority: 'urgent',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'open',
      awaiting: 'team',
      priority: 'urgent',
      hasNewReply: false,
      messageCount: 1,
      expectedResponseText: 'معمولاً تا ۲۴ ساعت',
    });
    const staff = await call('GET', '/questions/[id]', {
      ...as('mentor'),
      params: { id: res.body.id },
    });
    expect(staff.body).toMatchObject({
      assignee: { id: mentor.id },
      student: { id: student.id },
      sla: { slaHours: 4, breached: false },
      viaAssignment: false,
      studentSummary: { id: student.id },
    });
    expect(staff.body.slaRemainingHours).toBe(staff.body.sla.remainingHours);
    expect(staff.body.messages[0]).toMatchObject({
      author: { id: student.id, role: 'student' },
      links: [{ url: 'https://example.com/job', label: null }],
    });
  });

  it('team reply → answered; student reply → open again; close; a student message reopens it', async () => {
    const created = await ask('student', { subject: 'سؤال چرخه', body: 'سؤال' });
    const id = created.body.id;
    const reply = await call('POST', '/questions/[id]/messages', {
      ...as('mentor'),
      params: { id },
      body: { body: 'پاسخ مشاور', cannedResponseId: SEEDED.cannedResponses.redLine },
    });
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({ status: 'answered', awaiting: 'student', sla: null });
    expect(reply.body.firstResponseAt).not.toBeNull();
    const mine = await call('GET', '/me/questions', { ...as('student') });
    expect(mine.body.items.find((q: { id: string }) => q.id === id)).toMatchObject({
      hasNewReply: true,
    });

    const back = await call('POST', '/questions/[id]/messages', {
      ...as('student'),
      params: { id },
      body: { body: 'ممنون، یک سؤال دیگر' },
    });
    expect(back.body).toMatchObject({ status: 'open', awaiting: 'team' });

    const closed = await call('POST', '/questions/[id]/close', { ...as('mentor'), params: { id } });
    expect(closed.body).toMatchObject({ status: 'closed', awaiting: 'none' });
    const staffOnClosed = await call('POST', '/questions/[id]/messages', {
      ...as('mentor'),
      params: { id },
      body: { body: 'x' },
    });
    expect(staffOnClosed.status).toBe(409);
    const reopen = await call('POST', '/questions/[id]/messages', {
      ...as('student'),
      params: { id },
      body: { body: 'دوباره گیر کردم' },
    });
    expect(reopen.body).toMatchObject({ status: 'open', awaiting: 'team' });
  });

  it('student DTOs carry no staff ids, summary or canned-response id (strict schema)', async () => {
    const created = await ask('student', { subject: 'شکل DTO', body: 'متن' });
    await call('POST', '/questions/[id]/messages', {
      ...as('mentor'),
      params: { id: created.body.id },
      body: { body: 'پاسخ', cannedResponseId: SEEDED.cannedResponses.redLine },
    });
    const res = await call('GET', '/questions/[id]', {
      ...as('student'),
      params: { id: created.body.id },
    });
    const message = z.strictObject({
      id: z.string(),
      author: z.strictObject({ displayName: z.string(), isMe: z.boolean(), isTeam: z.boolean() }),
      body: z.string(),
      links: z.array(z.strictObject({ url: z.string(), label: z.string().nullable() })),
      attachments: z.array(z.unknown()),
      createdAt: z.string(),
    });
    const schema = z.strictObject({
      id: z.string(),
      subject: z.string(),
      status: z.string(),
      awaiting: z.string(),
      priority: z.string(),
      task: z.unknown().nullable(),
      messageCount: z.number(),
      hasNewReply: z.boolean(),
      createdAt: z.string(),
      lastMessageAt: z.string().nullable(),
      messages: z.array(message),
      expectedResponseText: z.string(),
    });
    expect(schema.safeParse(res.body).success).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(mentor.id);
  });

  it('a student cannot use canned responses; another student gets 404 like a missing id', async () => {
    const created = await ask('student', { subject: 'مال من', body: 'متن' });
    const canned = await call('POST', '/questions/[id]/messages', {
      ...as('student'),
      params: { id: created.body.id },
      body: { body: 'x', cannedResponseId: SEEDED.cannedResponses.redLine },
    });
    expect(canned.status).toBe(422);
    const missing = await call('GET', '/questions/[id]', {
      ...as('otherStudent'),
      params: { id: MISSING },
    });
    for (const [method, path] of [
      ['GET', '/questions/[id]'],
      ['POST', '/questions/[id]/close'],
    ] as const) {
      const res = await call(method, path, {
        ...as('otherStudent'),
        params: { id: created.body.id },
      });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(missing.body);
    }
    const foreignMentor = await call('GET', '/questions/[id]', {
      ...as('otherMentor'),
      params: { id: created.body.id },
    });
    expect(foreignMentor.status).toBe(404);
  });
});

describe('reference ids (C3, T-REF)', () => {
  it('taskId of another student → 422 and no thread; own task works («درخواست تمدید»)', async () => {
    const foreignTask = await taskFixture(otherStudent.id, otherMentor.id);
    const before = await getDb()
      .select({ id: questionThreads.id })
      .from(questionThreads)
      .where(eq(questionThreads.studentId, student.id));
    const bad = await ask('student', { subject: 'تمدید', body: 'x', taskId: foreignTask });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields).toEqual({ taskId: 'مقدار نامعتبر است' });
    const after = await getDb()
      .select({ id: questionThreads.id })
      .from(questionThreads)
      .where(eq(questionThreads.studentId, student.id));
    expect(after.length).toBe(before.length);

    const own = await taskFixture(student.id, mentor.id, { title: 'سند نیچ' });
    const ok = await ask('student', {
      subject: 'درخواست تمدید مهلت',
      body: 'برای سند نیچ دو روز بیشتر وقت لازم دارم.',
      taskId: own,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.task).toEqual({ id: own, title: 'سند نیچ' });
  });

  it("attachments: someone else's pending upload → 422; own upload is linked and readable", async () => {
    const theirs = await call('POST', '/attachments', {
      ...as('otherStudent'),
      form: formWith(await imageBytes()),
    });
    const bad = await ask('student', {
      subject: 'تصویر',
      body: 'x',
      attachmentIds: [theirs.body.id],
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields).toEqual({ attachmentIds: 'مقدار نامعتبر است' });

    const mine = await call('POST', '/attachments', {
      ...as('student'),
      form: formWith(await imageBytes()),
    });
    const ok = await ask('student', {
      subject: 'تصویر',
      body: 'این صفحه',
      attachmentIds: [mine.body.id],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.messages[0].attachments[0].id).toBe(mine.body.id);
    for (const who of ['student', 'mentor']) {
      const file = await call('GET', '/attachments/[id]', {
        ...as(who),
        params: { id: mine.body.id },
      });
      expect(file.status).toBe(200);
    }
    const foreign = await call('GET', '/attachments/[id]', {
      ...as('otherMentor'),
      params: { id: mine.body.id },
    });
    expect(foreign.status).toBe(404);
  });

  it('assignee change: admin only, and only to an active admin or mentor', async () => {
    const created = await ask('student', { subject: 'واگذاری', body: 'x' });
    const toStudent = await call('PUT', '/questions/[id]/assignee', {
      ...as('admin'),
      params: { id: created.body.id },
      body: { assigneeId: otherStudent.id },
    });
    expect(toStudent.status).toBe(422);
    const byMentor = await call('PUT', '/questions/[id]/assignee', {
      ...as('mentor'),
      params: { id: created.body.id },
      body: { assigneeId: otherMentor.id },
    });
    expect(byMentor.status).toBe(403);
  });
});

describe('out-of-scope assignee (M-assignee, ADR-0004, SEC-A8)', () => {
  it('sees only that thread and the summary while open; 404 after closing', async () => {
    const created = await ask('student', {
      subject: 'سؤال تخصصی طراحی',
      body: 'نمونه‌کارم را ببین',
      attachmentIds: [
        (
          await call('POST', '/attachments', {
            ...as('student'),
            form: formWith(await imageBytes()),
          })
        ).body.id,
      ],
    });
    const id = created.body.id;
    const fileId = created.body.messages[0].attachments[0].id;
    const assign = await call('PUT', '/questions/[id]/assignee', {
      ...as('admin'),
      params: { id },
      body: { assigneeId: assigneeMentor.id },
    });
    expect(assign.body.assignee.id).toBe(assigneeMentor.id);

    const thread = await call('GET', '/questions/[id]', {
      ...as('assigneeMentor'),
      params: { id },
    });
    expect(thread.status).toBe(200);
    expect(thread.body).toMatchObject({ viaAssignment: true, studentSummary: { id: student.id } });
    const list = await call('GET', '/questions', { ...as('assigneeMentor') });
    expect(list.body.items.map((q: { id: string }) => q.id)).toEqual([id]);
    const summary = await call('GET', '/students/[id]/summary', {
      ...as('assigneeMentor'),
      params: { id: student.id },
    });
    expect(summary.status).toBe(200);
    const file = await call('GET', '/attachments/[id]', {
      ...as('assigneeMentor'),
      params: { id: fileId },
    });
    expect(file.status).toBe(200);
    // Nothing else of the record.
    for (const path of [
      '/students/[id]',
      '/students/[id]/notes',
      '/students/[id]/tasks',
      '/students/[id]/health',
      '/students/[id]/milestones',
    ] as const) {
      const res = await call('GET', path, { ...as('assigneeMentor'), params: { id: student.id } });
      expect(res.status, path).toBe(404);
    }
    const reply = await call('POST', '/questions/[id]/messages', {
      ...as('assigneeMentor'),
      params: { id },
      body: { body: 'پاسخ متخصص' },
    });
    expect(reply.status).toBe(201);

    const closed = await call('POST', '/questions/[id]/close', {
      ...as('assigneeMentor'),
      params: { id },
    });
    expect(closed.status).toBe(200);
    const missing = await call('GET', '/questions/[id]', {
      ...as('assigneeMentor'),
      params: { id: MISSING },
    });
    const after = await call('GET', '/questions/[id]', { ...as('assigneeMentor'), params: { id } });
    expect(after.status).toBe(404);
    expect(after.body).toEqual(missing.body);
    const summaryAfter = await call('GET', '/students/[id]/summary', {
      ...as('assigneeMentor'),
      params: { id: student.id },
    });
    expect(summaryAfter.status).toBe(404);
    const fileAfter = await call('GET', '/attachments/[id]', {
      ...as('assigneeMentor'),
      params: { id: fileId },
    });
    expect(fileAfter.status).toBe(404);
    const listAfter = await call('GET', '/questions', { ...as('assigneeMentor') });
    expect(listAfter.body.items).toEqual([]);
  });
});

describe('mentor change, «امروز» and the canary', () => {
  it('open questions of the old mentor move to the new one', async () => {
    const s = await createUser('student', { mentorId: mentor.id });
    const open = await questionFixture(s.id, mentor.id);
    const closed = await questionFixture(s.id, mentor.id, { status: 'closed' });
    await call('PUT', '/students/[id]/mentor', {
      ...as('admin'),
      params: { id: s.id },
      body: { mentorId: otherMentor.id },
    });
    const rows = await getDb()
      .select({ id: questionThreads.id, assigneeId: questionThreads.assigneeId })
      .from(questionThreads)
      .where(eq(questionThreads.studentId, s.id));
    expect(rows.find((r) => r.id === open)?.assigneeId).toBe(otherMentor.id);
    expect(rows.find((r) => r.id === closed)?.assigneeId).toBe(mentor.id);
    const old = await call('GET', '/questions/[id]', { ...as('mentor'), params: { id: open } });
    expect(old.status).toBe(404);
  });

  it('«امروز»: unanswered questions and a breached question in «منتظر ما»', async () => {
    const s = await createUser('student', { mentorId: otherMentor.id });
    const late = await questionFixture(s.id, otherMentor.id, {
      awaitingTeamSince: new Date(Date.now() - 20 * 24 * 3600_000),
    });
    const res = await call('GET', '/today', { ...as('otherMentor') });
    expect(res.body.unansweredQuestions.map((q: { id: string }) => q.id)).toContain(late);
    expect(res.body.counts.unansweredQuestions).toBe(res.body.unansweredQuestions.length);
    expect(res.body.unansweredQuestions[0]).toMatchObject({ id: late, sla: { breached: true } });
    expect(res.body.waitingOnUs).toContainEqual(
      expect.objectContaining({ kind: 'question', refId: late, studentId: s.id, breached: true }),
    );
    const mentorView = await call('GET', '/today', { ...as('mentor') });
    expect(mentorView.body.unansweredQuestions.map((q: { id: string }) => q.id)).not.toContain(
      late,
    );
  });

  it('an internal note never appears in the student question views', async () => {
    const created = await ask('student', { subject: 'قناری', body: 'متن' });
    await noteFixture(student.id, mentor.id, { body: `${CANARY} یادداشت داخلی` });
    for (const res of [
      await call('GET', '/me/questions', { ...as('student') }),
      await call('GET', '/questions/[id]', { ...as('student'), params: { id: created.body.id } }),
    ]) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(CANARY);
    }
  });

  it('canned responses: mentors read active ones; the red-line answer is seeded', async () => {
    const res = await call('GET', '/canned-responses', { ...as('mentor') });
    expect(res.body).toContainEqual(
      expect.objectContaining({ id: SEEDED.cannedResponses.redLine, category: 'red_line' }),
    );
    const write = await call('POST', '/canned-responses', {
      ...as('mentor'),
      body: { title: 'x', body: 'y' },
    });
    expect(write.status).toBe(403);
  });
});
