import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '@/modules/admin/schema';
import { settings } from '@/modules/catalog/schema';
import { seedIdsFor } from '@/modules/catalog/seed';
import { getAccessSettings } from '@/modules/catalog/service';
import {
  addOrganizationMember,
  createOrganization,
  listOrganizations,
  renameOrganization,
} from '@/modules/identity/organizations';
import { DEFAULT_ORGANIZATION_ID, organizations } from '@/modules/identity/schema';
import { CliError } from '@/modules/identity/service';
import { students } from '@/modules/students/schema';
import { notes } from '@/modules/timeline/schema';
import { getDb } from '@/server/db';
import { noteFixture, taskFixture } from './fixtures';
import {
  call,
  createUser,
  localForm,
  loginAs,
  SESSION_COOKIE,
  type TestUser,
  uniquePhone,
} from './helpers';

/**
 * ADR-0011 (SaaS sprint 1): two organizations on one database. Nothing of one is visible or
 * writable from the other, and an account that belongs to both switches between them.
 */

const slug = `org-b-${crypto.randomUUID().slice(0, 8)}`;
let orgB = '';
const a: Record<'admin' | 'mentor' | 'student', TestUser> = {} as never;
const b: Record<'admin' | 'mentor' | 'student', TestUser> = {} as never;
const c: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  orgB = (await createOrganization({ slug, name: 'آکادمی آزمایشی ب' })).id;
  a.admin = await createUser('admin');
  a.mentor = await createUser('mentor');
  a.student = await createUser('student', { mentorId: a.mentor.id });
  b.admin = await createUser('admin', { organizationId: orgB });
  b.mentor = await createUser('mentor', { organizationId: orgB });
  b.student = await createUser('student', { mentorId: b.mentor.id, organizationId: orgB });
  for (const [key, user] of [
    ['aAdmin', a.admin],
    ['aMentor', a.mentor],
    ['bAdmin', b.admin],
    ['bMentor', b.mentor],
    ['bStudent', b.student],
  ] as const) {
    c[key] = (await loginAs(user)).cookies;
  }
});

describe('organization CLI (ADR-0011)', () => {
  it('org:create seeds its own catalog; the slug is unique', async () => {
    const stages = await call('GET', '/stages', { cookies: c.bAdmin });
    expect(stages.status).toBe(200);
    const ids = stages.body.map((s: { id: string }) => s.id);
    expect(ids).toEqual(expect.arrayContaining(seedIdsFor(orgB).stages));
    expect(ids).not.toContain(seedIdsFor(DEFAULT_ORGANIZATION_ID).stages[0]);
    await expect(createOrganization({ slug, name: 'تکراری' })).rejects.toBeInstanceOf(CliError);
    await expect(createOrganization({ slug: 'Bad Slug', name: 'نامعتبر' })).rejects.toThrow(/slug/);
    const listed = await listOrganizations();
    expect(listed.find((o) => o.id === orgB)).toMatchObject({ slug, members: 3 });
  });

  it('org:rename changes name and slug and is audited', async () => {
    const renamed = await renameOrganization({ slug, name: 'آکادمی ب', newSlug: `${slug}-x` });
    expect(renamed).toMatchObject({ id: orgB, name: 'آکادمی ب', slug: `${slug}-x` });
    await renameOrganization({ slug: `${slug}-x`, newSlug: slug });
    await expect(renameOrganization({ slug: 'default', newSlug: slug })).rejects.toThrow(/taken/);
    const audits = await getDb()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, orgB), eq(auditLog.action, 'organization.renamed')));
    expect(audits).toHaveLength(2);
    const [row] = await getDb()
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgB));
    expect(row?.name).toBe('آکادمی ب');
  });

  it('org:add-member takes staff accounts only, once per organization', async () => {
    await expect(
      addOrganizationMember({ org: slug, phone: a.student.phone, role: 'mentor' }),
    ).rejects.toThrow(/mentee/);
    await expect(
      addOrganizationMember({ org: slug, phone: a.mentor.phone, role: 'mentee' }),
    ).rejects.toThrow(/--role/);
    await expect(
      addOrganizationMember({ org: slug, phone: b.mentor.phone, role: 'mentor' }),
    ).rejects.toThrow(/already a member/);
    await expect(
      addOrganizationMember({ org: slug, phone: uniquePhone(), role: 'mentor' }),
    ).rejects.toThrow(/No account/);
  });
});

describe('isolation between organizations', () => {
  it('staff lists show only their own organization', async () => {
    const list = await call('GET', '/students', { cookies: c.bAdmin });
    expect(list.status).toBe(200);
    expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([b.student.id]);
    const users = await call('GET', '/users', { cookies: c.bAdmin });
    const userIds = users.body.items.map((u: { id: string }) => u.id);
    expect(new Set(userIds)).toEqual(new Set([b.admin.id, b.mentor.id, b.student.id]));
    const mentors = await call('GET', '/mentors', { cookies: c.aAdmin });
    expect(mentors.body.map((m: { id: string }) => m.id)).not.toContain(b.mentor.id);
  });

  it('a record of another organization is 404 even for an admin', async () => {
    for (const [cookies, id] of [
      [c.bAdmin, a.student.id],
      [c.aAdmin, b.student.id],
      [c.aMentor, b.student.id],
    ] as const) {
      const res = await call('GET', '/students/[id]', { cookies, params: { id } });
      expect(res.status).toBe(404);
    }
    const taskId = await taskFixture(a.student.id, a.mentor.id);
    const task = await call('GET', '/tasks/[id]', { cookies: c.bAdmin, params: { id: taskId } });
    expect(task.status).toBe(404);
    const role = await call('PATCH', '/users/[id]/role', {
      cookies: c.bAdmin,
      params: { id: a.mentor.id },
      body: { role: 'admin' },
    });
    expect(role.status).toBe(404);
  });

  it('references across organizations are refused (mentor of another organization)', async () => {
    const res = await call('POST', '/students', {
      cookies: c.bAdmin,
      body: { displayName: 'هنرجوی ارجاع', phone: localForm(uniquePhone()), mentorId: a.mentor.id },
    });
    expect(res.status).toBe(422);
  });

  it('a new student lands in the creator organization, on its own first stage', async () => {
    const res = await call('POST', '/students', {
      cookies: c.bAdmin,
      body: { displayName: 'هنرجوی سازمان ب', phone: localForm(uniquePhone()) },
    });
    expect(res.status).toBe(201);
    const [row] = await getDb()
      .select({ organizationId: students.organizationId, stage: students.currentStageId })
      .from(students)
      .where(eq(students.userId, res.body.student.id));
    expect(row?.organizationId).toBe(orgB);
    expect(row?.stage).toBe(seedIdsFor(orgB).stages[0]);
  });

  it('child rows inherit the organization of their parent (trigger)', async () => {
    const noteId = await noteFixture(b.student.id, b.mentor.id);
    const [row] = await getDb()
      .select({ organizationId: notes.organizationId })
      .from(notes)
      .where(eq(notes.id, noteId));
    expect(row?.organizationId).toBe(orgB);
  });

  it('settings are per organization', async () => {
    const put = await call('PUT', '/settings/[key]', {
      cookies: c.bAdmin,
      params: { key: 'access' },
      body: { mentorScope: 'all', mentorsCanInviteStudents: true },
    });
    expect(put.status).toBe(200);
    expect(await getAccessSettings(getDb(), orgB)).toMatchObject({ mentorScope: 'all' });
    const [stored] = await getDb()
      .select({ organizationId: settings.organizationId })
      .from(settings)
      .where(and(eq(settings.key, 'access'), eq(settings.organizationId, orgB)));
    expect(stored?.organizationId).toBe(orgB);
    // "all" in B widens B only: a B mentor sees B's other students, never A's.
    const mine = await call('GET', '/students', { cookies: c.bMentor });
    expect(mine.body.items.map((s: { id: string }) => s.id)).not.toContain(a.student.id);
    const elsewhere = await call('GET', '/students', { cookies: c.aMentor });
    const ids = elsewhere.body.items.map((s: { id: string }) => s.id);
    expect(ids).not.toContain(b.student.id);
  });

  it('exports contain only the own organization', async () => {
    const res = await call('GET', '/exports/students.csv', { cookies: c.bAdmin });
    expect(res.status).toBe(200);
    const csv = new TextDecoder().decode(res.bytes);
    expect(csv).toContain(b.student.displayName);
    expect(csv.split('\n').length).toBeLessThanOrEqual(4);
  });
});

describe('an account in two organizations (ADR-0011 section 2)', () => {
  it('signs in to the oldest membership and switches with a rotated session', async () => {
    const shared = await createUser('mentor', { displayName: 'مربی مشترک' });
    await addOrganizationMember({ org: slug, phone: shared.phone, role: 'admin' });
    const s = await loginAs(shared);
    const me = await call('GET', '/auth/me', { cookies: s.cookies });
    expect(me.body.organization).toMatchObject({ id: DEFAULT_ORGANIZATION_ID, role: 'mentor' });

    const options = await call('GET', '/auth/organizations', { cookies: s.cookies });
    expect(options.status).toBe(200);
    expect(options.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: DEFAULT_ORGANIZATION_ID, current: true }),
        expect.objectContaining({ id: orgB, role: 'admin', current: false }),
      ]),
    );

    const switched = await call('POST', '/auth/organization', {
      cookies: s.cookies,
      body: { organizationId: orgB },
    });
    expect(switched.status).toBe(200);
    expect(switched.body.user.organization).toMatchObject({ id: orgB, role: 'admin' });
    expect(switched.body.user.role).toBe('admin');
    const fresh = { [SESSION_COOKIE]: switched.cookies[SESSION_COOKIE] ?? '' };
    expect(fresh[SESSION_COOKIE]).not.toBe(s.session);
    // The old session is revoked; the new one acts as admin of organization B only.
    expect((await call('GET', '/auth/me', { cookies: s.cookies })).status).toBe(401);
    const list = await call('GET', '/students', { cookies: fresh });
    expect(list.body.items.map((x: { id: string }) => x.id)).toContain(b.student.id);
    expect(list.body.items.map((x: { id: string }) => x.id)).not.toContain(a.student.id);

    const [audit] = await getDb()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(eq(auditLog.actorId, shared.id), eq(auditLog.action, 'session.organization_switched')),
      );
    expect(audit).toBeTruthy();
  });

  it('cannot switch to an organization it does not belong to', async () => {
    const res = await call('POST', '/auth/organization', {
      cookies: c.bMentor,
      body: { organizationId: DEFAULT_ORGANIZATION_ID },
    });
    expect(res.status).toBe(404);
    const bad = await call('POST', '/auth/organization', {
      cookies: c.bMentor,
      body: { organizationId: 'not-a-uuid' },
    });
    expect([404, 422]).toContain(bad.status);
  });

  it('name and phone of a shared account cannot be changed by one organization', async () => {
    const shared = await createUser('mentor');
    await addOrganizationMember({ org: slug, phone: shared.phone, role: 'mentor' });
    const res = await call('PATCH', '/users/[id]', {
      cookies: c.bAdmin,
      params: { id: shared.id },
      body: { displayName: 'نام تازه' },
    });
    expect(res.status).toBe(409);
    const disable = await call('PATCH', '/users/[id]', {
      cookies: c.bAdmin,
      params: { id: shared.id },
      body: { status: 'disabled' },
    });
    expect(disable.status).toBe(200);
    // Disabled in B only: still signs in to the default organization.
    const s = await loginAs(shared);
    const me = await call('GET', '/auth/me', { cookies: s.cookies });
    expect(me.body.organization.id).toBe(DEFAULT_ORGANIZATION_ID);
  });

  it('a mentee only sees its own organization', async () => {
    const res = await call('GET', '/auth/organizations', { cookies: c.bStudent });
    expect(res.body).toEqual([
      expect.objectContaining({ id: orgB, role: 'mentee', current: true }),
    ]);
  });
});
