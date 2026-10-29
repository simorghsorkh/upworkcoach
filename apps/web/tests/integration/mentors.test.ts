import { and, eq, isNull } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { putAccessSettings } from '@/modules/catalog/service';
import { createOrganization } from '@/modules/identity/organizations';
import { enrollmentMentors, enrollments, programRuns } from '@/modules/programs/schema';
import { getDb } from '@/server/db';
import { call, createUser, loginAs, SEEDED, type TestUser } from './helpers';

/**
 * Coach Office sprint 4: who a mentor works with comes from `enrollment_mentors` and
 * `run_staff` (not `students.primary_mentor_id` alone); the legacy primary mirrors the
 * student's mentor; private notes stay hidden from the admin; the mentor directory, profile
 * and "transfer all".
 */

let admin: TestUser;
let m1: TestUser;
let m2: TestUser;
let m3: TestUser;
let ac: Record<string, string>;
let c1: Record<string, string>;
let c2: Record<string, string>;
let c3: Record<string, string>;

beforeAll(async () => {
  admin = await createUser('admin');
  m1 = await createUser('mentor');
  m2 = await createUser('mentor');
  m3 = await createUser('mentor');
  ac = (await loginAs(admin)).cookies;
  c1 = (await loginAs(m1)).cookies;
  c2 = (await loginAs(m2)).cookies;
  c3 = (await loginAs(m3)).cookies;
});

async function legacyEnrollmentId(studentId: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(programRuns, eq(programRuns.id, enrollments.runId))
    .where(and(eq(programRuns.legacyPathId, SEEDED.path), eq(enrollments.studentId, studentId)));
  return row?.id ?? '';
}

async function activeMentorRows(enrollmentId: string) {
  return getDb()
    .select({ userId: enrollmentMentors.userId, role: enrollmentMentors.role })
    .from(enrollmentMentors)
    .where(
      and(eq(enrollmentMentors.enrollmentId, enrollmentId), isNull(enrollmentMentors.endedAt)),
    );
}

const sees = async (cookies: Record<string, string>, studentId: string) =>
  (await call('GET', '/students/[id]', { cookies, params: { id: studentId } })).status === 200;

/** A published one-phase template and a group run made from it (admin). */
async function groupRun(title: string) {
  const tpl = await call('POST', '/program-templates', {
    cookies: ac,
    body: { kind: 'program', title: `قالب ${title}` },
  });
  const tplId = tpl.body.id as string;
  await call('POST', '/program-templates/[id]/nodes', {
    cookies: ac,
    params: { id: tplId },
    body: { nodeType: 'phase', title: 'فاز یک' },
  });
  await call('POST', '/program-templates/[id]/publish', { cookies: ac, params: { id: tplId } });
  const run = await call('POST', '/program-runs', {
    cookies: ac,
    body: { templateId: tplId, mode: 'group', title },
  });
  expect(run.status).toBe(201);
  return run.body.id as string;
}

describe('the legacy primary mentor mirrors students.primary_mentor_id', () => {
  it('opens a primary row for a new student and moves it on a mentor change', async () => {
    const student = await createUser('student', { mentorId: m1.id });
    const enrollmentId = await legacyEnrollmentId(student.id);
    expect(await activeMentorRows(enrollmentId)).toEqual([{ userId: m1.id, role: 'primary' }]);

    const moved = await call('PUT', '/students/[id]/mentor', {
      cookies: ac,
      params: { id: student.id },
      body: { mentorId: m2.id, reason: 'جابه‌جایی' },
    });
    expect(moved.status).toBe(200);
    expect(await activeMentorRows(enrollmentId)).toEqual([{ userId: m2.id, role: 'primary' }]);
    const history = await call('GET', '/enrollments/[id]/mentors', {
      cookies: ac,
      params: { id: enrollmentId },
    });
    expect(history.body.isLegacy).toBe(true);
    expect(history.body.active[0]).toMatchObject({
      user: { id: m2.id },
      role: 'primary',
      assignedBy: { id: admin.id },
      reason: 'جابه‌جایی',
    });
    expect(history.body.history.map((h: { user: { id: string } }) => h.user.id)).toEqual([m1.id]);
    expect(await sees(c1, student.id)).toBe(false);
    expect(await sees(c2, student.id)).toBe(true);
  });

  it('assigning a legacy primary through the enrollment goes through the student record', async () => {
    const student = await createUser('student', { mentorId: m1.id });
    const enrollmentId = await legacyEnrollmentId(student.id);
    const res = await call('POST', '/enrollments/[id]/mentors', {
      cookies: ac,
      params: { id: enrollmentId },
      body: { mentorId: m3.id, role: 'primary' },
    });
    expect(res.status).toBe(200);
    const record = await call('GET', '/students/[id]', { cookies: ac, params: { id: student.id } });
    expect(record.body.mentor?.id).toBe(m3.id);
    expect(await sees(c3, student.id)).toBe(true);
    expect(await sees(c1, student.id)).toBe(false);
  });
});

describe('acceptance: mentors of a cohort run', () => {
  it('two staff mentors of a run see all its students; a third mentor does not', async () => {
    const runId = await groupRun('گروه پذیرش');
    const s1 = await createUser('student');
    const s2 = await createUser('student', { mentorId: m3.id });
    for (const userId of [m1.id, m2.id]) {
      const staff = await call('POST', '/program-runs/[id]/staff', {
        cookies: ac,
        params: { id: runId },
        body: { userId, role: 'mentor' },
      });
      expect(staff.status).toBe(200);
    }
    const joined = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: ac,
      params: { id: runId },
      body: { studentIds: [s1.id, s2.id] },
    });
    expect(joined.status).toBe(200);

    for (const cookies of [c1, c2]) {
      expect(await sees(cookies, s1.id)).toBe(true);
      expect(await sees(cookies, s2.id)).toBe(true);
      const list = await call('GET', '/students', { cookies });
      const ids = list.body.items.map((s: { id: string }) => s.id);
      expect(ids).toEqual(expect.arrayContaining([s1.id, s2.id]));
    }
    // m3 is s2's primary mentor (legacy run) but not on this run's staff: only s2.
    expect(await sees(c3, s1.id)).toBe(false);
    expect(await sees(c3, s2.id)).toBe(true);
    const third = await createUser('mentor');
    const tc = (await loginAs(third)).cookies;
    expect(await sees(tc, s1.id)).toBe(false);
    expect(await sees(tc, s2.id)).toBe(false);

    // A student who drops out of the run leaves the run staff's scope.
    const enrollment = joined.body.enrollments.find(
      (e: { student: { id: string } }) => e.student.id === s1.id,
    );
    const dropped = await call('PATCH', '/enrollments/[id]', {
      cookies: ac,
      params: { id: enrollment.id },
      body: { status: 'dropped' },
    });
    expect(dropped.status).toBe(200);
    expect(await sees(c1, s1.id)).toBe(false);

    // Ending a staff row ends the access.
    await call('DELETE', '/program-runs/[id]/staff/[userId]', {
      cookies: ac,
      params: { id: runId, userId: m2.id },
    });
    expect(await sees(c2, s2.id)).toBe(false);
    expect(await sees(c1, s2.id)).toBe(true);
  });
});

describe('primary and secondary mentors of an enrollment', () => {
  it('a secondary mentor gets access; a new primary transfers; ending removes access', async () => {
    const runId = await groupRun('گروه دو مشاوره');
    const student = await createUser('student', { mentorId: m1.id });
    const joined = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: ac,
      params: { id: runId },
      body: { studentIds: [student.id] },
    });
    const enrollmentId = joined.body.enrollments[0].id as string;
    const path = { cookies: ac, params: { id: enrollmentId } };

    expect(await sees(c2, student.id)).toBe(false);
    const secondary = await call('POST', '/enrollments/[id]/mentors', {
      ...path,
      body: { mentorId: m2.id, role: 'secondary' },
    });
    expect(secondary.status).toBe(200);
    expect(await sees(c2, student.id)).toBe(true);
    const again = await call('POST', '/enrollments/[id]/mentors', {
      ...path,
      body: { mentorId: m2.id, role: 'secondary' },
    });
    expect(again.status).toBe(409);

    const primary = await call('POST', '/enrollments/[id]/mentors', {
      ...path,
      body: { mentorId: m3.id, role: 'primary' },
    });
    expect(primary.status).toBe(200);
    // The secondary is promoted to primary: their secondary row ends.
    const promoted = await call('POST', '/enrollments/[id]/mentors', {
      ...path,
      body: { mentorId: m2.id, role: 'primary' },
    });
    expect(promoted.status).toBe(200);
    expect(promoted.body.active).toEqual([
      expect.objectContaining({ user: expect.objectContaining({ id: m2.id }), role: 'primary' }),
    ]);
    expect(promoted.body.history.map((h: { role: string }) => h.role).sort()).toEqual([
      'primary',
      'secondary',
    ]);
    expect(await sees(c3, student.id)).toBe(false);

    // The student's programs card lists the current mentors.
    const cards = await call('GET', '/students/[id]/enrollments', {
      cookies: ac,
      params: { id: student.id },
    });
    const card = cards.body.find((e: { id: string }) => e.id === enrollmentId);
    expect(card.mentors).toEqual([{ id: m2.id, displayName: m2.displayName, role: 'primary' }]);

    const ended = await call('DELETE', '/enrollments/[id]/mentors/[userId]', {
      ...path,
      params: { id: enrollmentId, userId: m2.id },
    });
    expect(ended.status).toBe(200);
    expect(ended.body.active).toEqual([]);
    expect(await sees(c2, student.id)).toBe(false);
    expect(await sees(c1, student.id)).toBe(true);
  });

  it('only the admin assigns; a mentor gets 403; another organization 404', async () => {
    const student = await createUser('student', { mentorId: m1.id });
    const enrollmentId = await legacyEnrollmentId(student.id);
    const byMentor = await call('POST', '/enrollments/[id]/mentors', {
      cookies: c1,
      params: { id: enrollmentId },
      body: { mentorId: m2.id, role: 'secondary' },
    });
    expect(byMentor.status).toBe(403);
    const studentAsMentor = await call('POST', '/enrollments/[id]/mentors', {
      cookies: ac,
      params: { id: enrollmentId },
      body: { mentorId: student.id, role: 'secondary' },
    });
    expect(studentAsMentor.status).toBe(422);

    const orgB = (
      await createOrganization({
        slug: `ment-${crypto.randomUUID().slice(0, 8)}`,
        name: 'سازمان ب',
      })
    ).id;
    const bAdmin = await createUser('admin', { organizationId: orgB });
    const bc = (await loginAs(bAdmin)).cookies;
    const cross = await call('GET', '/enrollments/[id]/mentors', {
      cookies: bc,
      params: { id: enrollmentId },
    });
    expect(cross.status).toBe(404);
  });
});

describe('private notes (ADR-0011 section 6)', () => {
  it('reach the author and the student’s mentors, never the admin', async () => {
    const student = await createUser('student', { mentorId: m1.id });
    const enrollmentId = await legacyEnrollmentId(student.id);
    await call('POST', '/enrollments/[id]/mentors', {
      cookies: ac,
      params: { id: enrollmentId },
      body: { mentorId: m2.id, role: 'secondary' },
    });
    const created = await call('POST', '/students/[id]/notes', {
      cookies: c1,
      params: { id: student.id },
      body: { body: 'یادداشت محرمانه', visibility: 'private' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ visibility: 'private', isAuthor: true });
    const noteId = created.body.id as string;
    await call('POST', '/students/[id]/notes', {
      cookies: c1,
      params: { id: student.id },
      body: { body: 'یادداشت داخلی' },
    });

    const bodies = async (cookies: Record<string, string>) => {
      const notes = await call('GET', '/students/[id]/notes', {
        cookies,
        params: { id: student.id },
      });
      return notes.body.items.map((n: { body: string }) => n.body);
    };
    expect(await bodies(c1)).toContain('یادداشت محرمانه');
    expect(await bodies(c2)).toContain('یادداشت محرمانه');
    expect(await bodies(ac)).toEqual(['یادداشت داخلی']);

    const timeline = await call('GET', '/students/[id]/timeline', {
      cookies: ac,
      params: { id: student.id },
    });
    expect(JSON.stringify(timeline.body)).not.toContain('یادداشت محرمانه');
    const filtered = await call('GET', '/students/[id]/notes', {
      cookies: ac,
      params: { id: student.id },
      query: { visibility: 'private' },
    });
    expect(filtered.body?.items ?? []).toEqual([]);

    for (const [method, body] of [
      ['PATCH', { body: 'تغییر' }],
      ['DELETE', undefined],
    ] as const) {
      const res = await call(method, '/notes/[id]', {
        cookies: ac,
        params: { id: noteId },
        body,
      });
      expect(res.status).toBe(404);
    }

    // The secondary reads it but only the author edits it.
    const bySecondary = await call('PATCH', '/notes/[id]', {
      cookies: c2,
      params: { id: noteId },
      body: { body: 'تغییر' },
    });
    expect(bySecondary.status).toBe(404);

    // An admin cannot make someone else's note private.
    const internal = (
      await call('GET', '/students/[id]/notes', { cookies: ac, params: { id: student.id } })
    ).body.items[0].id as string;
    const hide = await call('PATCH', '/notes/[id]', {
      cookies: ac,
      params: { id: internal },
      body: { visibility: 'private' },
    });
    expect(hide.status).toBe(403);
  });
});

describe('mentor directory and profile', () => {
  it('shows the workload; the mentor edits their own card only', async () => {
    const own = await call('PUT', '/mentors/[id]/profile', {
      cookies: c3,
      params: { id: m3.id },
      body: { specialties: ['طراحی', 'طراحی', 'سئو'], bio: 'مشاور طراحی', capacity: 1 },
    });
    expect(own.status).toBe(200);
    expect(own.body.profile).toEqual({
      specialties: ['طراحی', 'سئو'],
      bio: 'مشاور طراحی',
      capacity: 1,
      acceptingStudents: true,
    });
    const other = await call('PUT', '/mentors/[id]/profile', {
      cookies: c3,
      params: { id: m1.id },
      body: { bio: 'x' },
    });
    expect(other.status).toBe(404);

    const directory = await call('GET', '/mentors/directory', { cookies: c1 });
    expect(directory.status).toBe(200);
    const card = directory.body.items.find((i: { id: string }) => i.id === m3.id);
    expect(card.counts.primary).toBeGreaterThanOrEqual(1);
    expect(card.atCapacity).toBe(true);
    expect(directory.body.specialties).toEqual(expect.arrayContaining(['طراحی', 'سئو']));

    const filtered = await call('GET', '/mentors/directory', {
      cookies: ac,
      query: { specialty: 'سئو' },
    });
    expect(filtered.body.items.map((i: { id: string }) => i.id)).toEqual([m3.id]);
    const accepting = await call('GET', '/mentors/directory', {
      cookies: ac,
      query: { accepting: '1' },
    });
    expect(accepting.body.items.map((i: { id: string }) => i.id)).not.toContain(m3.id);

    expect(
      (await call('GET', '/mentors/[id]', { cookies: c1, params: { id: m3.id } })).status,
    ).toBe(404);
    const self = await call('GET', '/mentors/[id]', { cookies: c3, params: { id: m3.id } });
    expect(self.status).toBe(200);
    expect(self.body).toMatchObject({ canEdit: true, canTransfer: false });
    expect(self.body.students.length).toBeGreaterThanOrEqual(1);
  });

  it('transfer all moves every primary student to another mentor (admin only)', async () => {
    const leaving = await createUser('mentor');
    const target = await createUser('mentor');
    const a = await createUser('student', { mentorId: leaving.id });
    const b = await createUser('student', { mentorId: leaving.id });
    const lc = (await loginAs(leaving)).cookies;
    const denied = await call('POST', '/mentors/[id]/transfer', {
      cookies: lc,
      params: { id: leaving.id },
      body: { toMentorId: target.id },
    });
    expect(denied.status).toBe(403);
    const res = await call('POST', '/mentors/[id]/transfer', {
      cookies: ac,
      params: { id: leaving.id },
      body: { toMentorId: target.id, reason: 'خروج مشاور' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ moved: 2 });
    const tc = (await loginAs(target)).cookies;
    expect(await sees(tc, a.id)).toBe(true);
    expect(await sees(tc, b.id)).toBe(true);
    expect(await sees(lc, a.id)).toBe(false);
    const detail = await call('GET', '/mentors/[id]', { cookies: ac, params: { id: leaving.id } });
    expect(detail.body.counts.primary).toBe(0);
  });
});

describe('group runs by mentors (organization setting)', () => {
  it('is 403 until the admin allows it; then the mentor manages the run', async () => {
    const org = (
      await createOrganization({ slug: `grp-${crypto.randomUUID().slice(0, 8)}`, name: 'گروهی' })
    ).id;
    const oAdmin = await createUser('admin', { organizationId: org });
    const oMentor = await createUser('mentor', { organizationId: org });
    const oa = (await loginAs(oAdmin)).cookies;
    const om = (await loginAs(oMentor)).cookies;
    const tpl = await call('POST', '/program-templates', {
      cookies: oa,
      body: { kind: 'program', title: 'قالب گروهی' },
    });
    await call('POST', '/program-templates/[id]/nodes', {
      cookies: oa,
      params: { id: tpl.body.id },
      body: { nodeType: 'phase', title: 'فاز' },
    });
    await call('POST', '/program-templates/[id]/publish', {
      cookies: oa,
      params: { id: tpl.body.id },
    });
    const body = { templateId: tpl.body.id, mode: 'group', title: 'گروه مشاور' };
    expect((await call('POST', '/program-runs', { cookies: om, body })).status).toBe(403);
    await putAccessSettings(
      getDb(),
      org,
      { mentorScope: 'assigned', mentorsCanInviteStudents: true, mentorsCanCreateGroupRuns: true },
      oAdmin.id,
    );
    const created = await call('POST', '/program-runs', { cookies: om, body });
    expect(created.status).toBe(201);
    expect(created.body.staff).toEqual([
      expect.objectContaining({ id: oMentor.id, role: 'manager' }),
    ]);
  });
});
