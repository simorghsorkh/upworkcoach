import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrganization } from '@/modules/identity/organizations';
import { enrollments, programRuns, programTemplates, runNodes } from '@/modules/programs/schema';
import { students } from '@/modules/students/schema';
import { getDb } from '@/server/db';
import { call, createUser, loginAs, SEEDED, type TestUser } from './helpers';

/**
 * ADR-0012 (Coach Office sprint 3): program templates, runs with a snapshot of the template,
 * enrollments and phase changes; the legacy program that mirrors the 0.1 path; template
 * visibility between mentors; isolation between organizations.
 */

let admin: TestUser;
let mentor: TestUser;
let otherMentor: TestUser;
let ac: Record<string, string>;
let mc: Record<string, string>;
let oc: Record<string, string>;
const S = SEEDED.stages;

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor');
  otherMentor = await createUser('mentor');
  ac = (await loginAs(admin)).cookies;
  mc = (await loginAs(mentor)).cookies;
  oc = (await loginAs(otherMentor)).cookies;
});

async function legacyRun() {
  const [run] = await getDb()
    .select({ id: programRuns.id })
    .from(programRuns)
    .where(eq(programRuns.legacyPathId, SEEDED.path));
  return run?.id ?? '';
}

async function legacyEnrollment(studentId: string) {
  const [row] = await getDb()
    .select({
      id: enrollments.id,
      status: enrollments.status,
      stageId: runNodes.legacyStageId,
    })
    .from(enrollments)
    .innerJoin(runNodes, eq(runNodes.id, enrollments.currentPhaseNodeId))
    .where(and(eq(enrollments.runId, await legacyRun()), eq(enrollments.studentId, studentId)));
  return row ?? null;
}

/** An 8-week program with two phases (one gate) and three activities, published. */
async function publishedTemplate(cookies = ac, title = 'برنامه‌ی هشت‌هفته‌ای') {
  const created = await call('POST', '/program-templates', {
    cookies,
    body: { kind: 'program', title, durationWeeks: 8, validityDays: 60 },
  });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  const addNode = (body: Record<string, unknown>) =>
    call('POST', '/program-templates/[id]/nodes', { cookies, params: { id }, body });
  const p1 = await addNode({ nodeType: 'phase', title: 'آشنایی', expectedDays: 14 });
  expect(p1.status).toBe(201);
  const phase1 = p1.body.phases[0].id as string;
  await addNode({ nodeType: 'phase', title: 'اجرا', isGate: true });
  await addNode({ parentId: phase1, nodeType: 'lesson', title: 'درس اول', body: 'متن درس' });
  await addNode({
    parentId: phase1,
    nodeType: 'checklist',
    title: 'چک‌لیست شروع',
    checklistItems: ['پروفایل', 'هدف'],
  });
  const last = await addNode({
    parentId: phase1,
    nodeType: 'assignment',
    title: 'تکلیف اول',
    dueOffsetDays: 7,
    submissionType: 'link',
  });
  expect(last.body.phases[0].activities).toHaveLength(3);
  const published = await call('POST', '/program-templates/[id]/publish', {
    cookies,
    params: { id },
  });
  expect(published.status).toBe(200);
  expect(published.body).toMatchObject({ status: 'published', revision: 1 });
  return published.body as { id: string; phases: Array<{ id: string; title: string }> };
}

describe('legacy program (migration 0008)', () => {
  it('every student has an enrollment in the legacy run at their stage', async () => {
    const s = await createUser('student', { mentorId: mentor.id, stageId: S[2] });
    expect(await legacyEnrollment(s.id)).toMatchObject({ status: 'active', stageId: S[2] });
  });

  it('a stage change and a lifecycle change reach the enrollment', async () => {
    const s = await createUser('student', { mentorId: mentor.id, stageId: S[1] });
    const res = await call('PUT', '/students/[id]/stage', {
      cookies: mc,
      params: { id: s.id },
      body: { toStageId: S[2], kind: 'advance' },
    });
    expect(res.status).toBe(200);
    expect(await legacyEnrollment(s.id)).toMatchObject({ stageId: S[2] });
    await getDb()
      .update(students)
      .set({ lifecycleStatus: 'graduated' })
      .where(eq(students.userId, s.id));
    expect(await legacyEnrollment(s.id)).toMatchObject({ status: 'completed' });
  });

  it('the legacy run shows its phases; a mentor sees only their mentees in it', async () => {
    const mine = await createUser('student', { mentorId: mentor.id });
    const notMine = await createUser('student', { mentorId: otherMentor.id });
    const asAdmin = await call('GET', '/program-runs/[id]', {
      cookies: ac,
      params: { id: await legacyRun() },
    });
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body).toMatchObject({ isLegacy: true, mode: 'group', status: 'active' });
    expect(asAdmin.body.phases.length).toBeGreaterThanOrEqual(9);
    const ids = (r: { body: { enrollments: Array<{ student: { id: string } }> } }) =>
      r.body.enrollments.map((e) => e.student.id);
    expect(ids(asAdmin)).toEqual(expect.arrayContaining([mine.id, notMine.id]));
    const asMentor = await call('GET', '/program-runs/[id]', {
      cookies: mc,
      params: { id: await legacyRun() },
    });
    expect(ids(asMentor)).toContain(mine.id);
    expect(ids(asMentor)).not.toContain(notMine.id);
    expect(asMentor.body.can).toMatchObject({ manage: false, enroll: false });
  });

  it('a phase change in the legacy run is a stage change', async () => {
    const s = await createUser('student', { mentorId: mentor.id, stageId: S[0] });
    const enrollment = await legacyEnrollment(s.id);
    const run = await call('GET', '/program-runs/[id]', {
      cookies: mc,
      params: { id: await legacyRun() },
    });
    const target = run.body.phases[1].id as string;
    const res = await call('PUT', '/enrollments/[id]/phase', {
      cookies: mc,
      params: { id: enrollment?.id ?? '' },
      body: { toNodeId: target, kind: 'advance' },
    });
    expect(res.status).toBe(200);
    expect(res.body.phase).toMatchObject({ id: target, position: 2 });
    const [row] = await getDb()
      .select({ stage: students.currentStageId })
      .from(students)
      .where(eq(students.userId, s.id));
    expect(row?.stage).toBe(S[1]);
  });

  it('the legacy template is read-only but can be duplicated', async () => {
    const [legacy] = await getDb()
      .select({ id: programTemplates.id })
      .from(programTemplates)
      .where(eq(programTemplates.legacyPathId, SEEDED.path));
    const id = legacy?.id ?? '';
    const patch = await call('PATCH', '/program-templates/[id]', {
      cookies: ac,
      params: { id },
      body: { title: 'تغییر' },
    });
    expect(patch.status).toBe(409);
    const copy = await call('POST', '/program-templates/[id]/duplicate', {
      cookies: ac,
      params: { id },
      body: { title: 'منتورینگ فریلنسری — دوره‌ی بهار' },
    });
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({
      status: 'draft',
      isLegacy: false,
      visibility: 'organization',
    });
    expect(copy.body.phases.length).toBeGreaterThanOrEqual(9);
    expect(copy.body.can.edit).toBe(true);
  });
});

describe('templates and runs (sprint-3 acceptance)', () => {
  it('one 8-week template runs as a group and as an individual run; editing it changes neither', async () => {
    const template = await publishedTemplate();
    const group = await call('POST', '/program-runs', {
      cookies: ac,
      body: { templateId: template.id, mode: 'group', title: 'گروه پاییز', startsOn: '2026-11-01' },
    });
    expect(group.status).toBe(201);
    expect(group.body).toMatchObject({ kind: 'program', templateRevision: 1 });
    expect(group.body.phases.map((p: { title: string }) => p.title)).toEqual(['آشنایی', 'اجرا']);
    const individual = await call('POST', '/program-runs', {
      cookies: ac,
      body: { templateId: template.id, mode: 'individual', title: 'تک‌نفره' },
    });
    expect(individual.status).toBe(201);

    const phase1 = template.phases[0]?.id ?? '';
    const renamed = await call('PATCH', '/program-templates/[id]/nodes/[nodeId]', {
      cookies: ac,
      params: { id: template.id, nodeId: phase1 },
      body: { title: 'آشنایی (نسخه‌ی تازه)' },
    });
    expect(renamed.status).toBe(200);
    const added = await call('POST', '/program-templates/[id]/nodes', {
      cookies: ac,
      params: { id: template.id },
      body: { nodeType: 'phase', title: 'جمع‌بندی' },
    });
    expect(added.body.revision).toBe(3);

    for (const run of [group.body.id, individual.body.id]) {
      const again = await call('GET', '/program-runs/[id]', { cookies: ac, params: { id: run } });
      expect(again.body.phases.map((p: { title: string }) => p.title)).toEqual(['آشنایی', 'اجرا']);
      expect(again.body.phases[0].activities).toHaveLength(3);
    }
    const third = await call('POST', '/program-runs', {
      cookies: ac,
      body: { templateId: template.id, mode: 'group', title: 'گروه زمستان' },
    });
    expect(third.body).toMatchObject({ templateRevision: 3 });
    expect(third.body.phases).toHaveLength(3);
  });

  it('enrolment, phase rules, seats, status and the mentee view', async () => {
    const template = await publishedTemplate();
    const run = await call('POST', '/program-runs', {
      cookies: ac,
      body: { templateId: template.id, mode: 'individual', title: 'منتورینگ فردی' },
    });
    const runId = run.body.id as string;
    const s1 = await createUser('student', { mentorId: mentor.id });
    const s2 = await createUser('student', { mentorId: mentor.id });
    const joined = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: ac,
      params: { id: runId },
      body: { studentIds: [s1.id] },
    });
    expect(joined.status).toBe(200);
    const enrollment = joined.body.enrollments[0];
    expect(enrollment).toMatchObject({
      student: { id: s1.id },
      status: 'active',
      phase: { position: 1 },
      daysInPhase: 0,
    });
    expect(enrollment.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const full = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: ac,
      params: { id: runId },
      body: { studentIds: [s2.id] },
    });
    expect(full.status).toBe(409);
    const again = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: ac,
      params: { id: runId },
      body: { studentIds: [s1.id] },
    });
    expect(again.status).toBe(409);

    const [p1, p2] = joined.body.phases as Array<{ id: string }>;
    const phase = (body: unknown) =>
      call('PUT', '/enrollments/[id]/phase', {
        cookies: mc,
        params: { id: enrollment.id },
        body,
      });
    expect((await phase({ toNodeId: p1?.id, kind: 'advance' })).status).toBe(409);
    expect((await phase({ toNodeId: p2?.id, kind: 'advance' })).body.phase.position).toBe(2);
    expect((await phase({ toNodeId: p1?.id, kind: 'regress' })).status).toBe(422);
    expect((await phase({ toNodeId: p1?.id, kind: 'regress', note: 'تکرار' })).status).toBe(200);
    expect((await phase({ toNodeId: SEEDED.path, kind: 'advance' })).status).toBe(422);

    const pause = await call('PATCH', '/enrollments/[id]', {
      cookies: mc,
      params: { id: enrollment.id },
      body: { status: 'paused' },
    });
    expect(pause.status).toBe(422);
    const paused = await call('PATCH', '/enrollments/[id]', {
      cookies: mc,
      params: { id: enrollment.id },
      body: { status: 'paused', pausedUntil: '2026-12-01' },
    });
    expect(paused.body).toMatchObject({ status: 'paused', pausedUntil: '2026-12-01' });
    await call('PATCH', '/enrollments/[id]', {
      cookies: mc,
      params: { id: enrollment.id },
      body: { status: 'active' },
    });

    const sc = (await loginAs(s1)).cookies;
    const mine = await call('GET', '/me/programs', { cookies: sc });
    expect(mine.status).toBe(200);
    const program = mine.body.find((p: { run: { id: string } }) => p.run.id === runId);
    expect(program.phases.map((p: { state: string }) => p.state)).toEqual(['current', 'locked']);
    expect(program.phases[0].activities).toHaveLength(3);
    expect(program.phases[1].activities).toEqual([]);

    const history = await call('GET', '/students/[id]/enrollments', {
      cookies: mc,
      params: { id: s1.id },
    });
    expect(history.body.map((e: { run: { id: string } }) => e.run.id)).toEqual(
      expect.arrayContaining([runId]),
    );
    expect(history.body.some((e: { run: { isLegacy: boolean } }) => e.run.isLegacy)).toBe(true);
  });

  it('run status follows its rules; a closed run takes nobody', async () => {
    const template = await publishedTemplate();
    const run = await call('POST', '/program-runs', {
      cookies: ac,
      body: { templateId: template.id, mode: 'group', title: 'گروه کوتاه' },
    });
    const id = run.body.id as string;
    const done = await call('PATCH', '/program-runs/[id]', {
      cookies: ac,
      params: { id },
      body: { status: 'completed' },
    });
    expect(done.body.status).toBe('completed');
    const s = await createUser('student');
    const late = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: ac,
      params: { id },
      body: { studentIds: [s.id] },
    });
    expect(late.status).toBe(409);
    await call('PATCH', '/program-runs/[id]', {
      cookies: ac,
      params: { id },
      body: { status: 'archived' },
    });
    const back = await call('PATCH', '/program-runs/[id]', {
      cookies: ac,
      params: { id },
      body: { status: 'active' },
    });
    expect(back.status).toBe(409);
  });

  it('a draft without runs can be deleted; a published one cannot', async () => {
    const draft = await call('POST', '/program-templates', {
      cookies: ac,
      body: { kind: 'program', title: 'پیش‌نویس' },
    });
    const publishEmpty = await call('POST', '/program-templates/[id]/publish', {
      cookies: ac,
      params: { id: draft.body.id },
    });
    expect(publishEmpty.status).toBe(409);
    expect(
      (
        await call('DELETE', '/program-templates/[id]', {
          cookies: ac,
          params: { id: draft.body.id },
        })
      ).status,
    ).toBe(204);
    const published = await publishedTemplate();
    expect(
      (
        await call('DELETE', '/program-templates/[id]', {
          cookies: ac,
          params: { id: published.id },
        })
      ).status,
    ).toBe(409);
  });

  it('a one-on-one needs no template and is always individual', async () => {
    const ok = await call('POST', '/program-runs', {
      cookies: ac,
      body: { kind: 'one_on_one', mode: 'individual', title: 'جلسات تک‌به‌تک' },
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ kind: 'one_on_one', phases: [], template: null });
    const group = await call('POST', '/program-runs', {
      cookies: ac,
      body: { kind: 'one_on_one', mode: 'group', title: 'گروهی' },
    });
    expect(group.status).toBe(422);
    const noKind = await call('POST', '/program-runs', {
      cookies: ac,
      body: { mode: 'individual', title: 'بی‌قالب' },
    });
    expect(noKind.status).toBe(422);
  });
});

describe('mentor templates (Q5) and mentor runs', () => {
  it("a mentor's template stays private until an admin approves it", async () => {
    const template = await publishedTemplate(mc, 'قالب خصوصی مشاور');
    expect(template).toMatchObject({ visibility: 'private' });
    const hidden = await call('GET', '/program-templates/[id]', {
      cookies: oc,
      params: { id: template.id },
    });
    expect(hidden.status).toBe(404);
    const list = await call('GET', '/program-templates', { cookies: oc });
    expect(list.body.map((t: { id: string }) => t.id)).not.toContain(template.id);

    const submitted = await call('POST', '/program-templates/[id]/submit', {
      cookies: mc,
      params: { id: template.id },
    });
    expect(submitted.body.visibility).toBe('pending_approval');
    const rejected = await call('POST', '/program-templates/[id]/reject', {
      cookies: ac,
      params: { id: template.id },
      body: { reason: 'فاز دوم توضیح ندارد' },
    });
    expect(rejected.body).toMatchObject({
      visibility: 'private',
      rejectionReason: 'فاز دوم توضیح ندارد',
    });
    await call('POST', '/program-templates/[id]/submit', {
      cookies: mc,
      params: { id: template.id },
    });
    expect(
      (
        await call('POST', '/program-templates/[id]/approve', {
          cookies: mc,
          params: { id: template.id },
        })
      ).status,
    ).toBe(403);
    const approved = await call('POST', '/program-templates/[id]/approve', {
      cookies: ac,
      params: { id: template.id },
    });
    expect(approved.body.visibility).toBe('organization');
    const visible = await call('GET', '/program-templates/[id]', {
      cookies: oc,
      params: { id: template.id },
    });
    expect(visible.status).toBe(200);
    expect(visible.body.can).toMatchObject({ edit: false, run: true });
  });

  it('a mentor runs individual programs for their own mentees and staffs them', async () => {
    const template = await publishedTemplate(mc, 'قالب فردی مشاور');
    const group = await call('POST', '/program-runs', {
      cookies: mc,
      body: { templateId: template.id, mode: 'group', title: 'گروه مشاور' },
    });
    expect(group.status).toBe(403);
    const run = await call('POST', '/program-runs', {
      cookies: mc,
      body: { templateId: template.id, mode: 'individual', title: 'برنامه‌ی فردی' },
    });
    expect(run.status).toBe(201);
    expect(run.body.staff).toEqual([expect.objectContaining({ id: mentor.id, role: 'mentor' })]);
    expect(run.body.can).toMatchObject({ manage: true, enroll: true, manageStaff: false });
    const other = await createUser('student', { mentorId: otherMentor.id });
    const refused = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: mc,
      params: { id: run.body.id },
      body: { studentIds: [other.id] },
    });
    expect(refused.status).toBe(422);
    const own = await createUser('student', { mentorId: mentor.id });
    const joined = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: mc,
      params: { id: run.body.id },
      body: { studentIds: [own.id] },
    });
    expect(joined.status).toBe(200);
    expect(
      (await call('GET', '/program-runs/[id]', { cookies: oc, params: { id: run.body.id } }))
        .status,
    ).toBe(404);
  });

  it('admin adds and ends staff; only organization staff can join', async () => {
    const template = await publishedTemplate();
    const run = await call('POST', '/program-runs', {
      cookies: ac,
      body: { templateId: template.id, mode: 'group', title: 'گروه با کادر' },
    });
    const id = run.body.id as string;
    const added = await call('POST', '/program-runs/[id]/staff', {
      cookies: ac,
      params: { id },
      body: { userId: otherMentor.id, role: 'mentor' },
    });
    expect(added.body.staff.map((s: { id: string }) => s.id)).toEqual([otherMentor.id]);
    const twice = await call('POST', '/program-runs/[id]/staff', {
      cookies: ac,
      params: { id },
      body: { userId: otherMentor.id, role: 'manager' },
    });
    expect(twice.status).toBe(409);
    const s = await createUser('student');
    const notStaff = await call('POST', '/program-runs/[id]/staff', {
      cookies: ac,
      params: { id },
      body: { userId: s.id, role: 'mentor' },
    });
    expect(notStaff.status).toBe(422);
    const ended = await call('DELETE', '/program-runs/[id]/staff/[userId]', {
      cookies: ac,
      params: { id, userId: otherMentor.id },
    });
    expect(ended.body.staff).toEqual([]);
  });
});

describe('organizations (ADR-0011)', () => {
  it('templates, runs and enrollments of another organization are 404', async () => {
    const orgB = (
      await createOrganization({
        slug: `prog-${crypto.randomUUID().slice(0, 8)}`,
        name: 'سازمان ب',
      })
    ).id;
    const bAdmin = await createUser('admin', { organizationId: orgB });
    const bc = (await loginAs(bAdmin)).cookies;
    const template = await publishedTemplate();
    const run = await call('POST', '/program-runs', {
      cookies: ac,
      body: { templateId: template.id, mode: 'group', title: 'گروه الف' },
    });
    expect(
      (await call('GET', '/program-templates/[id]', { cookies: bc, params: { id: template.id } }))
        .status,
    ).toBe(404);
    expect(
      (await call('GET', '/program-runs/[id]', { cookies: bc, params: { id: run.body.id } }))
        .status,
    ).toBe(404);
    const list = await call('GET', '/program-runs', { cookies: bc });
    expect(list.body.map((r: { id: string }) => r.id)).not.toContain(run.body.id);
    // The new organization got its own legacy program from the seed.
    expect(list.body.filter((r: { isLegacy: boolean }) => r.isLegacy)).toHaveLength(1);
    const bStudent = await createUser('student', { organizationId: orgB });
    const cross = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: ac,
      params: { id: run.body.id },
      body: { studentIds: [bStudent.id] },
    });
    expect(cross.status).toBe(422);
  });
});
