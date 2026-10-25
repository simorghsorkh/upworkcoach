import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '@/modules/admin/schema';
import { DEFAULT_HEALTH_RULES } from '@/modules/catalog/contracts';
import { SEED_IDS } from '@/modules/catalog/seed';
import {
  getPublicSettings,
  getSettings,
  getStaffSettings,
  updateSetting,
  updateSettings,
  updateStage,
} from '@/modules/catalog/service';
import { getCurrentCheckin, submitCheckin } from '@/modules/checkins/service';
import { recomputeHealth } from '@/modules/health/recompute';
import { studentHealth } from '@/modules/health/schema';
import { hashPassword } from '@/modules/identity/password';
import { users } from '@/modules/identity/schema';
import { students } from '@/modules/students/schema';
import { createStudent } from '@/modules/students/service';
import type { Actor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';
import { call, createUser, loginAs, uniquePhone } from './helpers';
import { createIsolatedDb } from './isolated-db';

/**
 * Settings (api.md section 13, data-model.md 2-2): GET/PUT for the admin, the read-only
 * staff and public views, validation, audit, versions, and the immediate health sweep after
 * a threshold change. Writes run in an isolated database (global state).
 */

let iso: Awaited<ReturnType<typeof createIsolatedDb>>;
let admin: Actor;
let mentor: Actor;
let studentActor: Actor;

async function user(role: 'admin' | 'mentor'): Promise<Actor> {
  const [row] = await iso.db
    .insert(users)
    .values({
      role,
      status: 'active',
      phone: uniquePhone(),
      displayName: `کاربر ${role}`,
      passwordHash: await hashPassword('irrelevant-long-pass-1'),
    })
    .returning({ id: users.id });
  return { userId: row?.id ?? '', role };
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.code : String(err);
  }
}

beforeAll(async () => {
  iso = await createIsolatedDb('uc_settings');
  admin = await user('admin');
  mentor = await user('mentor');
  const created = await createStudent(
    admin,
    { displayName: 'هنرجوی تنظیمات', phone: uniquePhone(), mentorId: mentor.userId },
    {},
    iso.db,
  );
  studentActor = { userId: created.student.id, role: 'student' };
});

afterAll(async () => {
  await iso.drop();
});

describe('GET /settings and the read-only views', () => {
  it('every key with defaults; the seed turned the check-in on (decision E5)', async () => {
    const all = await getSettings(admin, iso.db);
    expect(Object.keys(all).sort()).toEqual(
      ['access', 'business_hours', 'checkin', 'health.rules', 'questions', 'sla', 'tasks'].sort(),
    );
    expect(all.checkin).toMatchObject({ value: { enabled: true, weekday: 'thu' }, version: 1 });
    expect(all['health.rules']).toMatchObject({ value: DEFAULT_HEALTH_RULES, version: 0 });
    expect(all.sla.value.questionHours).toBe(24);
    expect(await codeOf(getSettings(mentor, iso.db))).toBe('FORBIDDEN');
  });

  it('mentors get the small staff view; everybody the public one', async () => {
    expect(await getStaffSettings(mentor, iso.db)).toEqual({
      questions: { expectedResponseText: 'معمولاً تا ۲۴ ساعت' },
      checkin: { enabled: true, weekday: 'thu' },
      access: { mentorScope: 'assigned', mentorsCanInviteStudents: true },
      sla: {
        questionHours: 24,
        urgentQuestionHours: 4,
        reviewHours: 48,
        reviewHoursNonGate: 72,
        clock: 'business',
      },
    });
    expect(await codeOf(getStaffSettings(studentActor, iso.db))).toBe('FORBIDDEN');
    expect(await getPublicSettings(studentActor, iso.db)).toEqual({
      questions: { expectedResponseText: 'معمولاً تا ۲۴ ساعت' },
      checkin: { enabled: true, weekday: 'thu' },
    });
  });
});

describe('PUT /settings and /settings/:key', () => {
  it('validates each key; unknown key → 404; red below yellow → 422', async () => {
    expect(await codeOf(updateSetting(admin, 'nope', {}, {}, iso.db))).toBe('NOT_FOUND');
    expect(await codeOf(updateSetting(admin, 'sla', { questionHours: 24 }, {}, iso.db))).toBe(
      'VALIDATION_FAILED',
    );
    const bad = {
      ...DEFAULT_HEALTH_RULES,
      inactivity: { yellowDays: 10, redDays: 5 },
    };
    try {
      await updateSetting(admin, 'health.rules', bad, {}, iso.db);
      expect.unreachable();
    } catch (err) {
      expect((err as ApiError).fields).toEqual({
        inactivity: 'آستانه‌ی قرمز باید از زرد بیشتر باشد.',
      });
    }
    expect(
      await codeOf(updateSetting(mentor, 'questions', { expectedResponseText: 'x' }, {}, iso.db)),
    ).toBe('FORBIDDEN');
  });

  it('writes, bumps the version and audits; several keys in one PUT', async () => {
    const one = await updateSetting(
      admin,
      'questions',
      { expectedResponseText: 'معمولاً تا ۱۲ ساعت' },
      { ip: '203.0.113.9' },
      iso.db,
    );
    expect(one).toMatchObject({ key: 'questions', version: 1 });
    const both = await updateSettings(
      admin,
      {
        questions: { expectedResponseText: 'تا فردا' },
        tasks: { defaultDueDays: 5 },
      },
      {},
      iso.db,
    );
    expect(both.questions).toMatchObject({
      value: { expectedResponseText: 'تا فردا' },
      version: 2,
    });
    expect(both.tasks).toMatchObject({ value: { defaultDueDays: 5 }, version: 1 });
    const audits = await iso.db
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'settings.updated'), eq(auditLog.actorId, admin.userId)));
    expect(audits.map((a) => a.data)).toEqual(
      expect.arrayContaining([
        { key: 'questions', version: 1 },
        { key: 'questions', version: 2 },
        { key: 'tasks', version: 1 },
      ]),
    );
  });

  it('mentorsCanInviteStudents=false shows in the staff view and blocks mentors', async () => {
    await updateSetting(
      admin,
      'access',
      { mentorScope: 'assigned', mentorsCanInviteStudents: false },
      {},
      iso.db,
    );
    expect((await getStaffSettings(mentor, iso.db)).access.mentorsCanInviteStudents).toBe(false);
    expect(
      await codeOf(
        createStudent(mentor, { displayName: 'ممنوع', phone: uniquePhone() }, {}, iso.db),
      ),
    ).toBe('FORBIDDEN');
    await updateSetting(
      admin,
      'access',
      { mentorScope: 'assigned', mentorsCanInviteStudents: true },
      {},
      iso.db,
    );
  });
});

describe('thresholds change → immediate sweep (ADR-0005)', () => {
  it('a lower R-INACT threshold makes an idle student yellow at once, with the settings version', async () => {
    await iso.db
      .update(students)
      .set({ lastActivityAt: new Date(Date.now() - 3 * 24 * 3600_000) })
      .where(eq(students.userId, studentActor.userId));
    await recomputeHealth(iso.db, [studentActor.userId]);
    const status = async () =>
      (
        await iso.db
          .select({ status: studentHealth.status, version: studentHealth.settingsVersion })
          .from(studentHealth)
          .where(eq(studentHealth.studentId, studentActor.userId))
      )[0];
    // R-NOTASK may already apply (no task); compare the reasons instead.
    const reasons = async () =>
      (
        await iso.db
          .select({ reasons: studentHealth.reasons })
          .from(studentHealth)
          .where(eq(studentHealth.studentId, studentActor.userId))
      )[0]?.reasons.map((r) => r.rule) ?? [];
    expect(await reasons()).not.toContain('R-INACT');
    await updateSetting(
      admin,
      'health.rules',
      { ...DEFAULT_HEALTH_RULES, inactivity: { yellowDays: 2, redDays: 20 } },
      {},
      iso.db,
    );
    expect(await reasons()).toContain('R-INACT');
    expect((await status())?.version).toBe(1);
  });

  it('expectedDays of the current stage changes → sweep (R-STALL)', async () => {
    await iso.db
      .update(students)
      .set({ stageEnteredAt: new Date(Date.now() - 30 * 24 * 3600_000) })
      .where(eq(students.userId, studentActor.userId));
    await updateStage(admin, SEED_IDS.stages[0] ?? '', { expectedDays: 5 }, {}, iso.db);
    const [row] = await iso.db
      .select({ reasons: studentHealth.reasons, status: studentHealth.status })
      .from(studentHealth)
      .where(eq(studentHealth.studentId, studentActor.userId));
    expect(row?.status).toBe('red');
    expect(row?.reasons.map((r) => r.rule)).toContain('R-STALL');
  });
});

describe('check-in switched off (api.md 11: every route 404)', () => {
  it('404 for the student and the staff while off; works again when on', async () => {
    await updateSetting(admin, 'checkin', { enabled: false, weekday: 'thu' }, {}, iso.db);
    expect(await codeOf(getCurrentCheckin(studentActor, iso.db))).toBe('NOT_FOUND');
    expect(await codeOf(submitCheckin(studentActor, { mood: 3, needsHelp: false }, iso.db))).toBe(
      'NOT_FOUND',
    );
    await updateSetting(admin, 'checkin', { enabled: true, weekday: 'sat' }, {}, iso.db);
    const current = await getCurrentCheckin(studentActor, iso.db);
    expect(current.open).toBe(true);
  });
});

describe('API shape', () => {
  it('PUT /settings/:key through HTTP (shared DB: same value, version moves)', async () => {
    const a = await createUser('admin');
    const cookies = (await loginAs(a)).cookies;
    const res = await call('PUT', '/settings/[key]', {
      cookies,
      params: { key: 'sla' },
      body: { questionHours: 24 },
    });
    expect(res.status).toBe(422);
    const get = await call('GET', '/settings', { cookies });
    expect(get.status).toBe(200);
    expect(get.body.sla.value.questionHours).toBe(24);
  });
});
