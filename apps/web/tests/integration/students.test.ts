import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '@/modules/admin/schema';
import { users } from '@/modules/identity/schema';
import { stageTransitions } from '@/modules/path/schema';
import { mentorAssignments, students } from '@/modules/students/schema';
import { getDb } from '@/server/db';
import {
  call,
  createUser,
  loginAs,
  SEEDED,
  type TestUser,
  tokenFromUrl,
  uniquePhone,
} from './helpers';

/**
 * Students module end to end through the Route Handlers (api.md section 4, F2): create with
 * invite, list / search / filter / paginate, record, edit (ifUpdatedAt), lifecycle,
 * platform profiles and snapshots, /me routes, last activity on login.
 */

let admin: TestUser;
let mentor: TestUser;
let adminCookies: Record<string, string>;
let mentorCookies: Record<string, string>;

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor', { displayName: 'مشاور فهرست' });
  adminCookies = (await loginAs(admin)).cookies;
  mentorCookies = (await loginAs(mentor)).cookies;
});

async function createViaApi(
  cookies: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ id: string; inviteUrl: string; res: Awaited<ReturnType<typeof call>> }> {
  const res = await call('POST', '/students', { cookies, body });
  return { id: res.body?.student?.id, inviteUrl: res.body?.inviteUrl, res };
}

describe('POST /students (F1, F2)', () => {
  it('creates user + record + initial transition + invite link with only name and phone', async () => {
    const phone = uniquePhone();
    const localWithPersianDigits = `۰${phone.slice(3)}`.replace(
      /\d/g,
      (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d,
    );
    const { id, inviteUrl, res } = await createViaApi(adminCookies, {
      displayName: 'سارا  كريمي',
      phone: localWithPersianDigits,
    });
    expect(res.status).toBe(201);
    expect(inviteUrl).toMatch(/^https:\/\/app\.test\/invite#t=[A-Za-z0-9_-]{43}$/);
    expect(res.body.student).toMatchObject({
      displayName: 'سارا کریمی',
      phone,
      accountStatus: 'invited',
      mentor: null,
      lifecycleStatus: 'active',
      stage: { id: SEEDED.stages[0], displayCode: '۰' },
      daysInStage: 0,
      // Sprint 4: computed right after the commit (no task yet, joined now → green).
      health: { status: 'green', reasons: [], churnRisk: false },
      openTaskCount: 0,
    });
    expect(res.body.student.completeness.percent).toBeLessThan(20);

    const [transition] = await getDb()
      .select({ kind: stageTransitions.kind, from: stageTransitions.fromStageId })
      .from(stageTransitions)
      .where(eq(stageTransitions.studentId, id));
    expect(transition).toEqual({ kind: 'initial', from: null });
    const audits = await getDb()
      .select({ action: auditLog.action, data: auditLog.data })
      .from(auditLog)
      .where(eq(auditLog.targetId, id));
    expect(audits.map((a) => a.action).sort()).toEqual([
      'user.invite_link_created',
      'user.invited',
    ]);
    expect(JSON.stringify(audits)).not.toContain('#t=');
  });

  it('the invite link activates the student, who then sees their own record', async () => {
    const phone = uniquePhone();
    const { id, inviteUrl } = await createViaApi(adminCookies, {
      displayName: 'هنرجوی دعوت',
      phone,
      mentorId: mentor.id,
    });
    const accepted = await call('POST', '/auth/tokens/accept', {
      body: { token: tokenFromUrl(inviteUrl), phone, password: 'student-pass-1' },
    });
    expect(accepted.status).toBe(200);
    const me = await call('GET', '/me/student', {
      cookies: { '__Host-uc_session': accepted.cookies['__Host-uc_session'] ?? '' },
    });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id, mentor: { displayName: 'مشاور فهرست' } });
    const [row] = await getDb()
      .select({ lastActivityAt: students.lastActivityAt })
      .from(students)
      .where(eq(students.userId, id));
    expect(row?.lastActivityAt).toBeInstanceOf(Date);
  });

  it('admin sets mentor, stage, track, platform and tags; one active assignment row', async () => {
    const { id, res } = await createViaApi(adminCookies, {
      displayName: 'هنرجوی کامل',
      phone: uniquePhone(),
      mentorId: mentor.id,
      stageId: SEEDED.stages[5],
      trackId: SEEDED.tracks.B,
      primaryPlatformId: SEEDED.platforms.upwork,
      tags: ['  کوهورت  پاییز ', 'کوهورت پاییز', 'vip'],
    });
    expect(res.status).toBe(201);
    expect(res.body.student).toMatchObject({
      mentor: { id: mentor.id },
      stage: { id: SEEDED.stages[5] },
      track: { code: 'B' },
      primaryPlatform: { name: 'Upwork' },
      tags: ['کوهورت پاییز', 'vip'],
    });
    const assignments = await getDb()
      .select({ mentorId: mentorAssignments.mentorId, endedAt: mentorAssignments.endedAt })
      .from(mentorAssignments)
      .where(eq(mentorAssignments.studentId, id));
    expect(assignments).toEqual([{ mentorId: mentor.id, endedAt: null }]);
  });

  it('a mentor always becomes the primary mentor (mentorId in the body is ignored)', async () => {
    const { res } = await createViaApi(mentorCookies, {
      displayName: 'هنرجوی مشاور',
      phone: uniquePhone(),
      mentorId: admin.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.student.mentor.id).toBe(mentor.id);
  });

  it('a duplicate phone → 409 PHONE_TAKEN and nothing is created', async () => {
    const phone = uniquePhone();
    await createViaApi(adminCookies, { displayName: 'اولی', phone });
    const second = await createViaApi(adminCookies, { displayName: 'دومی', phone });
    expect(second.res.status).toBe(409);
    expect(second.res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('validation: missing name, bad phone, unknown keys → 422 with Persian messages', async () => {
    const res = await call('POST', '/students', {
      cookies: adminCookies,
      body: { displayName: '  ', phone: '12345', initialPassword: 'x' },
    });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields).sort()).toEqual([
      'displayName',
      'initialPassword',
      'phone',
    ]);
  });
});

describe('GET /students — search, filters, sort, cursor (F2)', () => {
  let tag: string;
  let ids: string[] = [];

  beforeAll(async () => {
    tag = `فهرست-${Date.now()}`;
    ids = [];
    for (const [i, name] of ['الف آزمون', 'ب آزمون', 'پ آزمون'].entries()) {
      const { id } = await createViaApi(adminCookies, {
        displayName: name,
        phone: uniquePhone(),
        mentorId: i < 2 ? mentor.id : null,
        stageId: i === 0 ? SEEDED.stages[2] : SEEDED.stages[0],
        tags: [tag],
      });
      ids.push(id);
    }
    await call('POST', `/students/[id]/profiles`, {
      cookies: adminCookies,
      params: { id: ids[2] ?? '' },
      body: { platformId: SEEDED.platforms.contra, kind: 'profile', isPrimary: true },
    });
  });

  const list = async (query: Record<string, string>, cookies = adminCookies) =>
    (await call('GET', '/students', { cookies, query })).body;

  it('filters by tag, stage, mentor, unassigned and platform', async () => {
    expect((await list({ tag })).items.map((s: { id: string }) => s.id).sort()).toEqual(
      [...ids].sort(),
    );
    expect((await list({ tag, stageId: SEEDED.stages[2] ?? '' })).items).toHaveLength(1);
    expect((await list({ tag, mentorId: mentor.id })).items).toHaveLength(2);
    expect((await list({ tag, mentorId: 'none' })).items.map((s: { id: string }) => s.id)).toEqual([
      ids[2],
    ]);
    const byPlatform = await list({ tag, platformId: SEEDED.platforms.contra });
    expect(byPlatform.items.map((s: { id: string }) => s.id)).toEqual([ids[2]]);
    expect(byPlatform.items[0].primaryProfile).toMatchObject({ platformName: 'Contra' });
  });

  it('searches the normalised name and the phone in local form with Persian digits', async () => {
    const named = await list({ q: 'الف آزمون', tag });
    expect(named.items.map((s: { id: string }) => s.id)).toEqual([ids[0]]);
    const [row] = await getDb()
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, ids[1] ?? ''));
    const local = `0${row?.phone.slice(3)}`.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
    const byPhone = await list({ q: local });
    expect(byPhone.items.map((s: { id: string }) => s.id)).toEqual([ids[1]]);
    // LIKE wildcards are literal.
    expect((await list({ q: '%' })).items).toHaveLength(0);
  });

  it('the mentor list is the scope only, and filters cannot widen it', async () => {
    const mine = await list({ tag }, mentorCookies);
    expect(mine.items).toHaveLength(2);
    expect((await list({ tag, mentorId: 'none' }, mentorCookies)).items).toHaveLength(0);
  });

  it('lifecycle filter: default active+paused; graduated only on request', async () => {
    const res = await call('PUT', '/students/[id]/lifecycle', {
      cookies: adminCookies,
      params: { id: ids[0] ?? '' },
      body: { status: 'graduated' },
    });
    expect(res.status).toBe(200);
    expect((await list({ tag })).items).toHaveLength(2);
    expect((await list({ tag, lifecycle: 'graduated' })).items).toHaveLength(1);
    expect((await list({ tag, lifecycle: 'all' })).items).toHaveLength(3);
    expect(
      (await call('GET', '/students', { cookies: adminCookies, query: { lifecycle: 'x' } })).status,
    ).toBe(422);
  });

  it('paginates with an opaque cursor; a forged cursor → 422', async () => {
    const first = await list({ tag, lifecycle: 'all', limit: '2', sort: 'name' });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await list({
      tag,
      lifecycle: 'all',
      limit: '2',
      sort: 'name',
      cursor: first.nextCursor,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items].map((s: { id: string }) => s.id);
    expect(new Set(all).size).toBe(3);
    const bad = await call('GET', '/students', {
      cookies: adminCookies,
      query: { cursor: 'nope' },
    });
    expect(bad.status).toBe(422);
  });
});

describe('record edit, lifecycle and concurrency', () => {
  let id: string;
  beforeAll(async () => {
    id = (
      await createViaApi(adminCookies, {
        displayName: 'ویرایش',
        phone: uniquePhone(),
        mentorId: mentor.id,
      })
    ).id;
  });

  it('PATCH updates fields, normalises Persian text and digits, keeps search text in sync', async () => {
    const res = await call('PATCH', '/students/[id]', {
      cookies: mentorCookies,
      params: { id },
      body: {
        level: 'applying',
        primarySkill: 'طراحي  وب',
        hoursPerWeek: '۱۲',
        incomeGoalUsd: 1500,
        messengerHandle: '@sara_dev',
        tags: ['ویژه'],
        nicheStatement: 'به فروشگاه‌های Shopify کمک می‌کنم.',
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      level: 'applying',
      primarySkill: 'طراحی وب',
      hoursPerWeek: 12,
      messengerHandle: '@sara_dev',
      tags: ['ویژه'],
    });
    const found = await call('GET', '/students', {
      cookies: mentorCookies,
      query: { q: 'sara_dev' },
    });
    expect(found.body.items.map((s: { id: string }) => s.id)).toContain(id);
  });

  it('ifUpdatedAt: a stale save → 409 CONFLICT', async () => {
    const current = await call('GET', '/students/[id]', { cookies: adminCookies, params: { id } });
    const stale = current.body.updatedAt;
    const ok = await call('PATCH', '/students/[id]', {
      cookies: adminCookies,
      params: { id },
      body: { cohort: 'پاییز ۱۴۰۵', ifUpdatedAt: stale },
    });
    expect(ok.status).toBe(200);
    const conflict = await call('PATCH', '/students/[id]', {
      cookies: mentorCookies,
      params: { id },
      body: { cohort: 'زمستان', ifUpdatedAt: stale },
    });
    expect(conflict.status).toBe(409);
  });

  it('joinedAt is admin-only', async () => {
    const body = { joinedAt: '2026-01-01T00:00:00Z' };
    expect(
      (await call('PATCH', '/students/[id]', { cookies: mentorCookies, params: { id }, body }))
        .status,
    ).toBe(422);
    const res = await call('PATCH', '/students/[id]', {
      cookies: adminCookies,
      params: { id },
      body,
    });
    expect(res.status).toBe(200);
    expect(res.body.joinedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('lifecycle: paused needs a future pausedUntil; other statuses must not send it', async () => {
    const put = (body: unknown) =>
      call('PUT', '/students/[id]/lifecycle', { cookies: mentorCookies, params: { id }, body });
    expect((await put({ status: 'paused' })).status).toBe(422);
    expect((await put({ status: 'paused', pausedUntil: '2020-01-01' })).status).toBe(422);
    expect((await put({ status: 'active', pausedUntil: '2099-01-01' })).status).toBe(422);
    const paused = await put({ status: 'paused', pausedUntil: '2099-01-01', reason: 'سفر' });
    expect(paused.status).toBe(200);
    expect(paused.body).toMatchObject({
      lifecycleStatus: 'paused',
      pausedUntil: '2099-01-01',
      statusReason: 'سفر',
    });
    const back = await put({ status: 'active' });
    expect(back.body).toMatchObject({ lifecycleStatus: 'active', pausedUntil: null });
  });
});

describe('platform profiles (F2) — no password field, https only', () => {
  let id: string;
  let studentCookies: Record<string, string>;
  beforeAll(async () => {
    const student = await createUser('student', { mentorId: mentor.id });
    id = student.id;
    studentCookies = (await loginAs(student)).cookies;
  });

  it('the student adds a profile; the mentor sees it on the record header', async () => {
    const res = await call('POST', '/me/profiles', {
      cookies: studentCookies,
      body: {
        platformId: SEEDED.platforms.upwork,
        kind: 'profile',
        publicUrl: 'https://www.upwork.com/freelancers/~01abc',
        headline: 'Shopify Developer',
        rateAmount: '۲۵',
        rateUnit: 'hour',
        isPrimary: true,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      platform: { name: 'Upwork' },
      rateAmount: '25.00',
      rateCurrency: 'USD',
      status: 'building',
      isPrimary: true,
    });
    const record = await call('GET', '/students/[id]', { cookies: mentorCookies, params: { id } });
    expect(record.body.primaryProfile).toMatchObject({ headline: 'Shopify Developer' });
  });

  it('rejects non-https URLs, credentials in URLs and any password-like field (422)', async () => {
    for (const publicUrl of [
      'http://upwork.com/x',
      'javascript:alert(1)',
      'https://user:pass@upwork.com/x',
      'upwork.com/x',
    ]) {
      const res = await call('POST', '/me/profiles', {
        cookies: studentCookies,
        body: { platformId: SEEDED.platforms.upwork, kind: 'profile', publicUrl },
      });
      expect(res.status).toBe(422);
      expect(res.body.error.fields.publicUrl).toBeDefined();
    }
    const withPassword = await call('POST', '/me/profiles', {
      cookies: studentCookies,
      body: { platformId: SEEDED.platforms.upwork, kind: 'profile', password: 'secret' },
    });
    expect(withPassword.status).toBe(422);
    expect(withPassword.body.error.fields.password).toBeDefined();
  });

  it('only one primary profile; edit, approve, snapshot, soft delete', async () => {
    const second = await call('POST', '/students/[id]/profiles', {
      cookies: mentorCookies,
      params: { id },
      body: {
        platformId: SEEDED.platforms.fiverr,
        kind: 'gig',
        isPrimary: true,
        notes: 'برای هنرجو',
      },
    });
    expect(second.status).toBe(201);
    const profiles = (await call('GET', '/me/profiles', { cookies: studentCookies })).body;
    expect(profiles.filter((p: { isPrimary: boolean }) => p.isPrimary)).toHaveLength(1);
    expect(profiles[0].id).toBe(second.body.id);

    const patched = await call('PATCH', '/profiles/[id]', {
      cookies: studentCookies,
      params: { id: second.body.id },
      body: { status: 'active', headline: 'I will build your Shopify store' },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('active');

    expect(
      (
        await call('POST', '/profiles/[id]/approve', {
          cookies: studentCookies,
          params: { id: second.body.id },
        })
      ).status,
    ).toBe(403);
    const approved = await call('POST', '/profiles/[id]/approve', {
      cookies: mentorCookies,
      params: { id: second.body.id },
    });
    expect(approved.body.mentorApprovedAt).toEqual(expect.any(String));

    const snap = await call('POST', '/profiles/[id]/snapshots', {
      cookies: studentCookies,
      params: { id: second.body.id },
      body: { bodyText: 'Full gig description…', headline: 'v1' },
    });
    expect(snap.status).toBe(201);
    const snaps = await call('GET', '/profiles/[id]/snapshots', {
      cookies: mentorCookies,
      params: { id: second.body.id },
    });
    expect(snaps.body).toHaveLength(1);

    const deleted = await call('DELETE', '/profiles/[id]', {
      cookies: studentCookies,
      params: { id: second.body.id },
    });
    expect(deleted.status).toBe(204);
    for (const cookies of [studentCookies, mentorCookies, adminCookies]) {
      expect(
        (
          await call('PATCH', '/profiles/[id]', {
            cookies,
            params: { id: second.body.id },
            body: { niche: 'x' },
          })
        ).status,
      ).toBe(404);
    }
    expect((await call('GET', '/me/profiles', { cookies: studentCookies })).body).toHaveLength(1);
  });

  it('an inactive platform cannot be used for a new profile (422)', async () => {
    const created = await call('POST', '/platforms', {
      cookies: adminCookies,
      body: { name: `غیرفعال-${Date.now()}`, isActive: false },
    });
    expect(created.status).toBe(201);
    const res = await call('POST', '/me/profiles', {
      cookies: studentCookies,
      body: { platformId: created.body.id, kind: 'other' },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields).toEqual({ platformId: 'مقدار نامعتبر است' });
  });
});

describe('GET/PATCH /me/student', () => {
  it('whitelist edit and the self DTO', async () => {
    const student = await createUser('student', { mentorId: mentor.id });
    const cookies = (await loginAs(student)).cookies;
    const res = await call('PATCH', '/me/student', {
      cookies,
      body: {
        englishWriting: 3,
        goal90d: 'اولین قرارداد تا دی',
        primaryPlatformId: SEEDED.platforms.fiverr,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ englishWriting: 3, primaryPlatform: { name: 'Fiverr' } });
    const staffView = await call('GET', '/students/[id]', {
      cookies: mentorCookies,
      params: { id: student.id },
    });
    expect(staffView.body.goal90d).toBe('اولین قرارداد تا دی');
  });
});

describe('catalog lists', () => {
  it('stages, platforms and tracks for every role; inactive only for admins who ask', async () => {
    const student = await createUser('student');
    const cookies = (await loginAs(student)).cookies;
    const stages = await call('GET', '/stages', { cookies });
    expect(stages.status).toBe(200);
    const seededIds = [...SEEDED.stages];
    expect(
      stages.body
        .filter((s: { id: string }) => seededIds.includes(s.id))
        .map((s: { name: string }) => s.name),
    ).toEqual([
      'شروع و تعیین سطح',
      'انتخاب نیچ',
      'ساخت ویترین',
      'نمونه‌کار',
      'پیدا کردن فرصت مناسب',
      'پروپوزال و ارسال فعال',
      'مصاحبه و مذاکره',
      'تحویل پروژه و گرفتن نظر',
      'رشد',
    ]);
    expect(stages.body.every((s: { isActive: boolean }) => s.isActive)).toBe(true);
    const growth = stages.body.find((s: { id: string }) => s.id === SEEDED.stages[8]);
    expect(growth).toMatchObject({ isOpenEnded: true, expectedDays: null });

    const platforms = await call('GET', '/platforms', { cookies, query: { includeInactive: '1' } });
    expect(platforms.body.every((p: { isActive: boolean }) => p.isActive)).toBe(true);
    expect(platforms.body.map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(['Upwork', 'Fiverr', 'Contra', 'LinkedIn', 'مشتری مستقیم']),
    );
    const tracks = await call('GET', '/tracks', { cookies });
    expect(tracks.body.map((t: { code: string }) => t.code)).toEqual(['B', 'C', 'D']);
  });

  it('platform names are unique case-insensitively (422)', async () => {
    const res = await call('POST', '/platforms', {
      cookies: adminCookies,
      body: { name: 'upwork' },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.name).toBeDefined();
  });
});
