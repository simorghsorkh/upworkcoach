import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as healthz from '@/app/healthz/route';
import { auditLog } from '@/modules/admin/schema';
import { SETTINGS_DEFAULTS, slaSettingsSchema } from '@/modules/catalog/contracts';
import { SEED_IDS } from '@/modules/catalog/seed';
import { getSlaSettings } from '@/modules/catalog/service';
import { getHealthFreshness } from '@/modules/health/recompute';
import { studentHealth } from '@/modules/health/schema';
import { authTokens, DEFAULT_ORGANIZATION_ID, sessions, users } from '@/modules/identity/schema';
import { changeUserRole, eraseUser, updateUser } from '@/modules/identity/service';
import { sha256Hex } from '@/modules/identity/tokens';
import { students } from '@/modules/students/schema';
import { tasks } from '@/modules/tasks/schema';
import { getToday } from '@/modules/today/service';
import type { Actor } from '@/server/auth/current-user';
import { type DbOrTx, getDb } from '@/server/db';
import { errorResponse } from '@/server/http/handler';
import { logger, logSerializers, safeError } from '@/server/logger';
import { submittedTaskFixture } from './fixtures';
import {
  actorOf,
  addMembership,
  call,
  createUser,
  localForm,
  loginAs,
  ORIGIN,
  SESSION_COOKIE,
  type TestUser,
  tokenFromUrl,
  uniqueIp,
  uniquePhone,
} from './helpers';
import { createIsolatedDb } from './isolated-db';

/**
 * Follow-ups after sprints 1–4 (docs/05-delivery/followups.md): F-01 invite acceptance on
 * `users`, F-02 PATCH /users/:id and /role, F-06 re-authentication, F-08 /healthz, F-09
 * non-gate review SLA, F-14 health freshness, F-15 multipart 413, F-17 database errors in
 * logs. T-LOG (F-05) is in t-log.test.ts.
 */

let admin: TestUser;
let mentor: TestUser;
const c: Record<string, Record<string, string>> = {};
const META = { ip: '127.0.0.1', userAgent: null };

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor');
  c.admin = (await loginAs(admin)).cookies;
  c.mentor = (await loginAs(mentor)).cookies;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const letters = (n: number) =>
  Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[randomInt(0, 26)]).join('');

async function userRow(id: string) {
  const [row] = await getDb()
    .select({
      displayName: users.displayName,
      phone: users.phone,
      status: users.status,
      role: users.role,
      inviteAcceptedAt: users.inviteAcceptedAt,
      inviteAcceptedUserAgent: users.inviteAcceptedUserAgent,
    })
    .from(users)
    .where(eq(users.id, id));
  return row;
}

async function auditActions(targetId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.targetId, targetId));
  return rows.map((r) => r.action);
}

const meStatus = async (cookies: Record<string, string>) =>
  (await call('GET', '/auth/me', { cookies })).status;

/** Moves the session's sign-in 40 minutes back (and the password change before it). */
async function ageSession(user: TestUser, cookies: Record<string, string>): Promise<void> {
  const token = cookies[SESSION_COOKIE] ?? '';
  const past = new Date(Date.now() - 40 * 60_000);
  await getDb()
    .update(users)
    .set({ passwordChangedAt: new Date(Date.now() - 2 * 3600_000) })
    .where(eq(users.id, user.id));
  await getDb()
    .update(sessions)
    .set({ createdAt: past, lastUsedAt: past })
    .where(eq(sessions.tokenHash, sha256Hex(token)));
}

// ---- F-01 ---------------------------------------------------------------------------------

describe('F-01: «invite accepted» is kept on users (SEC-T5)', () => {
  it('accepting an invite writes the time and User-Agent; it survives token cleanup', async () => {
    const created = await call('POST', '/students', {
      cookies: c.admin,
      body: { displayName: 'هنرجوی دعوت', phone: uniquePhone(), mentorId: mentor.id },
    });
    expect(created.status).toBe(201);
    const studentId = created.body.student.id as string;
    expect(created.body.student.inviteAcceptedAt).toBeNull();
    expect(created.body.student.inviteAcceptedDevice).toBeNull();
    const phone = (await userRow(studentId))?.phone ?? '';

    const ua = `Mozilla/5.0 (Linux; Android 14) ${'x'.repeat(600)}`;
    const accepted = await call('POST', '/auth/tokens/accept', {
      body: { token: tokenFromUrl(created.body.inviteUrl), phone, password: 'kh8-ab-cd-ef' },
      userAgent: ua,
    });
    expect(accepted.status).toBe(200);
    const row = await userRow(studentId);
    expect(row?.inviteAcceptedAt).toBeInstanceOf(Date);
    expect(row?.inviteAcceptedUserAgent).toBe(ua.slice(0, 512));

    // auth.cleanup deletes the consumed token after 7 days: the label stays.
    await getDb().delete(authTokens).where(eq(authTokens.userId, studentId));
    const list = await call('GET', '/users', { cookies: c.admin, query: { role: 'student' } });
    const item = list.body.items.find((u: { id: string }) => u.id === studentId);
    expect(item.inviteAcceptedAt).toBe(row?.inviteAcceptedAt?.toISOString());
    expect(item.inviteAcceptedDevice).toBe(ua.slice(0, 512));
    expect(typeof item.updatedAt).toBe('string');

    const record = await call('GET', '/students/[id]', {
      cookies: c.mentor,
      params: { id: studentId },
    });
    expect(record.body.inviteAcceptedAt).toBe(row?.inviteAcceptedAt?.toISOString());
    expect(record.body.inviteAcceptedDevice).toBe(ua.slice(0, 512));
    // The student's own DTO never carries it (staff only).
    const self = await call('GET', '/me/student', {
      cookies: { [SESSION_COOKIE]: accepted.cookies[SESSION_COOKIE] ?? '' },
    });
    expect(self.status).toBe(200);
    expect(self.body).not.toHaveProperty('inviteAcceptedAt');
    expect(self.body).not.toHaveProperty('inviteAcceptedDevice');
  });

  it('a password reset does not overwrite it; erasure clears only the device', async () => {
    const student = await createUser('student');
    const at = new Date('2026-10-01T08:00:00Z');
    await getDb()
      .update(users)
      .set({ inviteAcceptedAt: at, inviteAcceptedUserAgent: 'old-device' })
      .where(eq(users.id, student.id));
    const reset = await call('POST', '/users/[id]/reset-link', {
      cookies: c.admin,
      params: { id: student.id },
    });
    const accepted = await call('POST', '/auth/tokens/accept', {
      body: {
        token: tokenFromUrl(reset.body.resetUrl),
        phone: student.phone,
        password: 'kh8-xy-zw-q',
      },
      userAgent: 'new-device',
    });
    expect(accepted.status).toBe(200);
    expect((await userRow(student.id))?.inviteAcceptedUserAgent).toBe('old-device');

    await eraseUser({
      userId: student.id,
      confirmDisplayName: student.displayName,
      requestedOn: '2026-10-22',
    });
    const erased = await userRow(student.id);
    expect(erased?.inviteAcceptedAt).toEqual(at);
    expect(erased?.inviteAcceptedUserAgent).toBeNull();
  });
});

describe('F-01: migration 0005 copies existing consumed invite tokens', () => {
  let iso: Awaited<ReturnType<typeof createIsolatedDb>>;
  beforeAll(async () => {
    iso = await createIsolatedDb('f01');
  });
  afterAll(async () => {
    await iso.drop();
  });

  it('latest consumed invite per user; reset tokens ignored; erased users get no device', async () => {
    const file = new URL('../../drizzle/0005_invite_accepted_session_reauth.sql', import.meta.url);
    const backfill = fs.readFileSync(file, 'utf8').split('--> statement-breakpoint').at(-1) ?? '';
    expect(backfill).toMatch(/UPDATE "users"/);

    const insertUser = async (erased: boolean) => {
      const [row] = await iso.db
        .insert(users)
        .values({
          role: 'student',
          status: erased ? 'disabled' : 'active',
          phone: erased ? `erased:${crypto.randomUUID()}` : uniquePhone(),
          displayName: 'بک‌فیل',
          erasedAt: erased ? new Date() : null,
        })
        .returning({ id: users.id });
      return row?.id ?? '';
    };
    const live = await insertUser(false);
    const gone = await insertUser(true);
    const token = (
      userId: string,
      purpose: 'invite' | 'password_reset',
      usedAt: Date,
      ua: string,
    ) =>
      iso.db.insert(authTokens).values({
        userId,
        purpose,
        tokenHash: sha256Hex(crypto.randomUUID()),
        expiresAt: new Date(),
        usedAt,
        usedUserAgent: ua,
      });
    await token(live, 'invite', new Date('2026-10-01T00:00:00Z'), 'first');
    await token(live, 'invite', new Date('2026-10-02T00:00:00Z'), 'second');
    await token(live, 'password_reset', new Date('2026-10-03T00:00:00Z'), 'reset');
    await token(gone, 'invite', new Date('2026-10-04T00:00:00Z'), 'erased-device');

    await iso.db.execute(sql.raw(backfill));
    const rows = await iso.db
      .select({ id: users.id, at: users.inviteAcceptedAt, ua: users.inviteAcceptedUserAgent })
      .from(users);
    expect(rows.find((r) => r.id === live)).toMatchObject({
      at: new Date('2026-10-02T00:00:00Z'),
      ua: 'second',
    });
    expect(rows.find((r) => r.id === gone)).toMatchObject({
      at: new Date('2026-10-04T00:00:00Z'),
      ua: null,
    });
  });
});

// ---- F-02 ---------------------------------------------------------------------------------

describe('F-02: PATCH /users/:id', () => {
  it('renaming a student rebuilds search_text; a new phone revokes sessions and is searchable', async () => {
    const student = await createUser('student', { mentorId: mentor.id });
    const studentAuth = await loginAs(student);
    const name = `Renamed ${letters(10)}`;
    const renamed = await call('PATCH', '/users/[id]', {
      cookies: c.admin,
      params: { id: student.id },
      body: { displayName: name },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.displayName).toBe(name);
    // A rename alone keeps the sessions.
    expect(await meStatus(studentAuth.cookies)).toBe(200);
    const byName = await call('GET', '/students', {
      cookies: c.admin,
      query: { q: name.split(' ')[1] ?? '', lifecycle: 'all' },
    });
    expect(byName.body.items.map((s: { id: string }) => s.id)).toEqual([student.id]);

    const newPhone = uniquePhone();
    const moved = await call('PATCH', '/users/[id]', {
      cookies: c.admin,
      params: { id: student.id },
      body: { phone: localForm(newPhone), ifUpdatedAt: renamed.body.updatedAt },
    });
    expect(moved.status).toBe(200);
    expect(moved.body.phone).toBe(newPhone);
    expect(await meStatus(studentAuth.cookies)).toBe(401);
    const actions = await auditActions(student.id);
    expect(actions).toEqual(expect.arrayContaining(['user.phone_changed', 'session.revoked_all']));
    const audit = await getDb()
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.targetId, student.id), eq(auditLog.action, 'user.phone_changed')));
    expect(JSON.stringify(audit)).not.toContain(newPhone.slice(3));

    const byPhone = await call('GET', '/students', {
      cookies: c.admin,
      query: { q: localForm(newPhone), lifecycle: 'all' },
    });
    expect(byPhone.body.items.map((s: { id: string }) => s.id)).toEqual([student.id]);
    const oldPhone = await call('GET', '/students', {
      cookies: c.admin,
      query: { q: localForm(student.phone), lifecycle: 'all' },
    });
    expect(oldPhone.body.items).toEqual([]);

    // Stale ifUpdatedAt → 409; a phone of someone else → 409 PHONE_TAKEN.
    const stale = await call('PATCH', '/users/[id]', {
      cookies: c.admin,
      params: { id: student.id },
      body: { displayName: 'دیر', ifUpdatedAt: renamed.body.updatedAt },
    });
    expect(stale.status).toBe(409);
    const taken = await call('PATCH', '/users/[id]', {
      cookies: c.admin,
      params: { id: student.id },
      body: { phone: mentor.phone },
    });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('PHONE_TAKEN');
  });

  it('disabling revokes every session and open link; re-enabling restores login (T-SESSION)', async () => {
    const other = await createUser('mentor');
    const auth = await loginAs(other);
    const link = await call('POST', '/users/[id]/reset-link', {
      cookies: c.admin,
      params: { id: other.id },
    });
    const disabled = await call('PATCH', '/users/[id]', {
      cookies: c.admin,
      params: { id: other.id },
      body: { status: 'disabled' },
    });
    expect(disabled.status).toBe(200);
    expect(disabled.body.status).toBe('disabled');
    expect(await meStatus(auth.cookies)).toBe(401);
    const lookup = await call('POST', '/auth/tokens/lookup', {
      body: { token: tokenFromUrl(link.body.resetUrl) },
    });
    expect(lookup.status).toBe(410);
    expect(await auditActions(other.id)).toEqual(
      expect.arrayContaining(['user.disabled', 'session.revoked_all']),
    );
    const login = await call('POST', '/auth/login', {
      body: { phone: other.phone, password: other.password },
    });
    expect(login.status).toBe(401);

    const enabled = await call('PATCH', '/users/[id]', {
      cookies: c.admin,
      params: { id: other.id },
      body: { status: 'active' },
    });
    expect(enabled.body.status).toBe('active');
    expect((await loginAs(other)).session).not.toBe('');
  });

  it('erased → 409; invited → active 409; empty body 422; mentor and student 403', async () => {
    const student = await createUser('student');
    await eraseUser({
      userId: student.id,
      confirmDisplayName: student.displayName,
      requestedOn: '2026-10-22',
    });
    const erased = await call('PATCH', '/users/[id]', {
      cookies: c.admin,
      params: { id: student.id },
      body: { displayName: 'دوباره' },
    });
    expect(erased.status).toBe(409);
    const invited = await createUser('mentor', { status: 'invited' });
    expect(
      (
        await call('PATCH', '/users/[id]', {
          cookies: c.admin,
          params: { id: invited.id },
          body: { status: 'active' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call('PATCH', '/users/[id]', {
          cookies: c.admin,
          params: { id: invited.id },
          body: {},
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call('PATCH', '/users/[id]', {
          cookies: c.admin,
          params: { id: invited.id },
          body: { role: 'admin' },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call('PATCH', '/users/[id]', {
          cookies: c.mentor,
          params: { id: invited.id },
          body: { status: 'disabled' },
        })
      ).status,
    ).toBe(403);
  });
});

describe('F-02: PATCH /users/:id/role', () => {
  it('T-ESC: a mentor gets 403, even for themselves', async () => {
    const res = await call('PATCH', '/users/[id]/role', {
      cookies: c.mentor,
      params: { id: mentor.id },
      body: { role: 'admin' },
    });
    expect(res.status).toBe(403);
    expect((await userRow(mentor.id))?.role).toBe('mentor');
  });

  it('mentor → admin revokes every session of the target and is audited', async () => {
    const target = await createUser('mentor');
    const auth = await loginAs(target);
    const res = await call('PATCH', '/users/[id]/role', {
      cookies: c.admin,
      params: { id: target.id },
      body: { role: 'admin' },
    });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
    expect(await meStatus(auth.cookies)).toBe(401);
    expect(await auditActions(target.id)).toEqual(
      expect.arrayContaining(['user.role_changed', 'session.revoked_all']),
    );
    // The old password (already ≥ 12 characters) still works with the new role.
    const again = await loginAs(target);
    expect((await call('GET', '/auth/me', { cookies: again.cookies })).body.role).toBe('admin');
  });

  it('a student never changes role (409); `student` as a target role → 422', async () => {
    const student = await createUser('student');
    expect(
      (
        await call('PATCH', '/users/[id]/role', {
          cookies: c.admin,
          params: { id: student.id },
          body: { role: 'mentor' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call('PATCH', '/users/[id]/role', {
          cookies: c.admin,
          params: { id: mentor.id },
          body: { role: 'student' },
        })
      ).status,
    ).toBe(422);
  });
});

describe('F-02: the last active admin (isolated database)', () => {
  let iso: Awaited<ReturnType<typeof createIsolatedDb>>;
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    iso = await createIsolatedDb('f02');
    for (const [key, role] of [
      ['a1', 'admin'],
      ['a2', 'admin'],
    ] as const) {
      const [row] = await iso.db
        .insert(users)
        .values({ role, status: 'active', phone: uniquePhone(), displayName: key })
        .returning({ id: users.id });
      ids[key] = row?.id ?? '';
      await addMembership(iso.db, ids[key] ?? '', role);
    }
  });
  afterAll(async () => {
    await iso.drop();
  });

  const as = (key: string): Actor => actorOf(ids[key] ?? '', 'admin');

  it('with two admins one can be demoted; the last one can be neither demoted nor disabled', async () => {
    const demoted = await changeUserRole(as('a1'), ids.a2 ?? '', { role: 'mentor' }, META, iso.db);
    expect(demoted.role).toBe('mentor');
    await expect(
      changeUserRole(as('a1'), ids.a1 ?? '', { role: 'mentor' }, META, iso.db),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateUser(as('a1'), ids.a1 ?? '', { status: 'disabled' }, META, iso.db),
    ).rejects.toMatchObject({ status: 409 });
    // Disabling a mentor is fine.
    const off = await updateUser(as('a1'), ids.a2 ?? '', { status: 'disabled' }, META, iso.db);
    expect(off.status).toBe('disabled');
  });
});

// ---- F-06 ---------------------------------------------------------------------------------

describe('F-06: POST /auth/reauth and the sensitive actions (SEC-S7)', () => {
  it('a sign-in older than 30 minutes needs the password again', async () => {
    const boss = await createUser('admin');
    const auth = await loginAs(boss);
    // Fresh sign-in: allowed.
    expect((await call('GET', '/exports/students.csv', { cookies: auth.cookies })).status).toBe(
      200,
    );

    await ageSession(boss, auth.cookies);
    const target = await createUser('mentor');
    const blocked = [
      await call('GET', '/exports/students.csv', { cookies: auth.cookies }),
      await call('GET', '/exports/tasks.csv', { cookies: auth.cookies }),
      await call('GET', '/exports/milestones.csv', { cookies: auth.cookies }),
      await call('POST', '/invitations', {
        cookies: auth.cookies,
        body: { role: 'admin', displayName: 'مدیر دوم', phone: uniquePhone() },
      }),
      await call('PATCH', '/users/[id]/role', {
        cookies: auth.cookies,
        params: { id: target.id },
        body: { role: 'admin' },
      }),
      await call('PUT', '/settings/[key]', {
        cookies: auth.cookies,
        params: { key: 'access' },
        body: SETTINGS_DEFAULTS.access,
      }),
      await call('PUT', '/settings', {
        cookies: auth.cookies,
        body: { access: SETTINGS_DEFAULTS.access },
      }),
    ];
    for (const res of blocked) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('REAUTH_REQUIRED');
    }
    expect((await userRow(target.id))?.role).toBe('mentor');
    // Other settings keys and ordinary admin work are not affected.
    expect(
      (
        await call('PUT', '/settings/[key]', {
          cookies: auth.cookies,
          params: { key: 'tasks' },
          body: { defaultDueDays: 3 },
        })
      ).status,
    ).toBe(200);
    expect((await call('GET', '/users', { cookies: auth.cookies })).status).toBe(200);

    const wrong = await call('POST', '/auth/reauth', {
      cookies: auth.cookies,
      body: { password: 'not-the-password' },
    });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.fields.password).toBeDefined();

    const ok = await call('POST', '/auth/reauth', {
      cookies: auth.cookies,
      body: { password: boss.password },
    });
    expect(ok.status).toBe(200);
    const validFor = new Date(ok.body.validUntil).getTime() - Date.now();
    expect(validFor).toBeGreaterThan(29 * 60_000);
    expect(validFor).toBeLessThanOrEqual(30 * 60_000);
    expect((await call('GET', '/exports/students.csv', { cookies: auth.cookies })).status).toBe(
      200,
    );
    expect(await auditActions(boss.id)).toContain('session.reauth');
  });

  it('wrong passwords share the change-password lock (5 in 15 minutes → 429)', async () => {
    const user = await createUser('mentor');
    const auth = await loginAs(user);
    for (let i = 0; i < 5; i += 1) {
      const res = await call('POST', '/auth/reauth', {
        cookies: auth.cookies,
        body: { password: 'wrong-wrong-wrong' },
      });
      expect(res.status).toBe(422);
    }
    const locked = await call('POST', '/auth/reauth', {
      cookies: auth.cookies,
      body: { password: user.password },
    });
    expect(locked.status).toBe(429);
    const change = await call('POST', '/auth/change-password', {
      cookies: auth.cookies,
      body: { currentPassword: user.password, newPassword: 'another-long-pass-1' },
    });
    expect(change.status).toBe(429);
  });

  it('a mentor with an old session still gets the plain 403 (role first)', async () => {
    const m = await createUser('mentor');
    const auth = await loginAs(m);
    await ageSession(m, auth.cookies);
    const res = await call('GET', '/exports/students.csv', { cookies: auth.cookies });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ---- F-08, F-14 ---------------------------------------------------------------------------

describe('F-08: /healthz (SEC-J4)', () => {
  it('returns exactly ok, db, lastHealthSweepAt, version and sweepStale', async () => {
    const res = await healthz.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['db', 'lastHealthSweepAt', 'ok', 'sweepStale', 'version'].sort(),
    );
    expect(body).toMatchObject({ ok: true, db: 'ok', version: expect.any(String) });
    expect(typeof body.sweepStale).toBe('boolean');
  });
});

describe('F-08 / F-14: health freshness (isolated database)', () => {
  let iso: Awaited<ReturnType<typeof createIsolatedDb>>;
  beforeAll(async () => {
    iso = await createIsolatedDb('f14');
  });
  afterAll(async () => {
    await iso.drop();
  });

  async function studentWithHealth(db: DbOrTx, computedAt: Date, lifecycle = 'active' as const) {
    const [user] = await db
      .insert(users)
      .values({ role: 'student', status: 'active', phone: uniquePhone(), displayName: 'س' })
      .returning({ id: users.id });
    const id = user?.id ?? '';
    await addMembership(db, id, 'student');
    await db.insert(students).values({
      organizationId: DEFAULT_ORGANIZATION_ID,
      userId: id,
      currentStageId: SEED_IDS.stages[0] ?? '',
      stageEnteredAt: new Date(),
      searchText: 'س',
      lifecycleStatus: lifecycle,
    });
    await db
      .insert(studentHealth)
      .values({ studentId: id, status: 'green', statusSince: computedAt, computedAt });
    return id;
  }

  it('fresh results → not stale; one active student older than 3 hours → stale', async () => {
    const admin1 = actorOf(crypto.randomUUID(), 'admin');
    const mentor1 = actorOf(crypto.randomUUID(), 'mentor');
    expect((await getHealthFreshness(iso.db)).stale).toBe(false);
    await studentWithHealth(iso.db, new Date(Date.now() - 10 * 60_000));
    const fresh = await getToday(admin1, {}, iso.db);
    expect(fresh.healthFreshness).toMatchObject({ stale: false, staleAfterHours: 3 });

    const oldAt = new Date(Date.now() - 4 * 3600_000);
    await studentWithHealth(iso.db, oldAt);
    const f = await getHealthFreshness(iso.db);
    expect(f.stale).toBe(true);
    expect(f.oldestComputedAt).toEqual(oldAt);
    const today = await getToday(admin1, {}, iso.db);
    expect(today.healthFreshness).toMatchObject({
      stale: true,
      oldestComputedAt: oldAt.toISOString(),
    });
    // Mentors do not get the system-wide flag.
    expect((await getToday(mentor1, {}, iso.db)).healthFreshness).toBeUndefined();
  });
});

// ---- F-09 ---------------------------------------------------------------------------------

describe('F-09: review SLA of non-gate tasks', () => {
  it('a value saved before the key existed reads 72', () => {
    const { reviewHoursNonGate: _omit, ...old } = SETTINGS_DEFAULTS.sla;
    expect(slaSettingsSchema.parse(old).reviewHoursNonGate).toBe(72);
  });

  it('the queue and «امروز» use reviewHours for gate tasks and reviewHoursNonGate otherwise', async () => {
    const student = await createUser('student', { mentorId: mentor.id });
    const gate = (await submittedTaskFixture(student.id, mentor.id)).taskId;
    const plain = (await submittedTaskFixture(student.id, mentor.id)).taskId;
    await getDb().update(tasks).set({ requiredForGate: true }).where(eq(tasks.id, gate));
    const sla = await getSlaSettings(getDb(), DEFAULT_ORGANIZATION_ID);
    const queue = await call('GET', '/review-queue', { cookies: c.mentor });
    const byId = new Map(queue.body.map((r: { taskId: string }) => [r.taskId, r]));
    expect(byId.get(gate)).toMatchObject({ slaHours: sla.reviewHours, requiredForGate: true });
    expect(byId.get(plain)).toMatchObject({
      slaHours: sla.reviewHoursNonGate,
      requiredForGate: false,
    });
    const today = await call('GET', '/today', { cookies: c.mentor });
    const waiting = new Map(
      today.body.waitingOnUs.map((w: { refId: string; slaHours: number }) => [w.refId, w.slaHours]),
    );
    expect(waiting.get(gate)).toBe(sla.reviewHours);
    expect(waiting.get(plain)).toBe(sla.reviewHoursNonGate);
    const staff = await call('GET', '/settings/staff', { cookies: c.mentor });
    expect(staff.body.sla.reviewHoursNonGate).toBe(sla.reviewHoursNonGate);
  });
});

// ---- F-15 ---------------------------------------------------------------------------------

describe('F-15: multipart upload with a declared Content-Length over the cap', () => {
  it('413 before the body is read', async () => {
    const student = await createUser('student');
    const { session } = await loginAs(student);
    const { POST } = await import('@/app/api/v1/attachments/route');
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength;
        if (pulled > 8 * 1024 * 1024) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const req = new Request(`${ORIGIN}/api/v1/attachments`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        cookie: `${SESSION_COOKIE}=${session}`,
        'content-type': 'multipart/form-data; boundary=----uc',
        'content-length': String(6 * 1024 * 1024),
        'x-forwarded-for': uniqueIp(),
      },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
    // Nothing near the cap was buffered (a stream may pre-pull a chunk or two).
    expect(pulled).toBeLessThan(512 * 1024);
  });
});

// ---- F-17 ---------------------------------------------------------------------------------

describe('F-17: database errors never log query parameters', () => {
  it('a real constraint violation: no phone, note text or hash in the log', async () => {
    const victim = await createUser('student');
    const secretNote = `یادداشت داخلی محرمانه ${letters(8)}`;
    const hash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo';
    let caught: unknown;
    try {
      await getDb().insert(users).values({
        role: 'mentor',
        phone: victim.phone,
        displayName: secretNote,
        passwordHash: hash,
      });
    } catch (err) {
      caught = err;
    }
    // The raw error really carries the parameters (otherwise this test proves nothing).
    expect(String((caught as Error).message)).toContain(victim.phone);

    // 1. The Route Handler's unhandled-error log.
    const logged: string[] = [];
    vi.spyOn(logger, 'error').mockImplementation(((...args: unknown[]) => {
      logged.push(JSON.stringify(args));
    }) as never);
    const res = errorResponse(caught, { requestId: 'r-1', path: '/api/v1/x' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(victim.phone);

    // 2. Any `{ err }` / `{ error }` through the real pino serializers.
    const lines: string[] = [];
    const out = pino(
      { serializers: logSerializers },
      { write: (line: string) => void lines.push(line) },
    );
    out.error({ err: caught }, 'boom');
    out.error({ error: caught }, 'boom');

    const all = [...logged, ...lines].join('\n');
    expect(all).toContain('23505');
    expect(all).toContain('users_phone_key');
    for (const leak of [victim.phone, victim.phone.slice(1), secretNote, hash, '$argon2id$']) {
      expect(all).not.toContain(leak);
    }
    expect(safeError(caught)).toMatchObject({
      database: true,
      code: '23505',
      constraint: 'users_phone_key',
      table: 'users',
    });
    expect(safeError(caught)).not.toHaveProperty('message');
    expect(safeError(caught)).not.toHaveProperty('stack');
  });

  it('an ordinary error keeps its message', () => {
    expect(safeError(new Error('plain failure'))).toMatchObject({ message: 'plain failure' });
  });
});
