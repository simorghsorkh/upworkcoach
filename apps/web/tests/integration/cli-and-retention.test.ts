import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { auditLog } from '@/modules/admin/schema';
import { recordAudit } from '@/modules/admin/service';
import {
  authThrottle,
  authTokens,
  DEFAULT_ORGANIZATION_ID,
  sessions,
  users,
} from '@/modules/identity/schema';
import {
  bootstrapAdmin,
  CliError,
  cleanupAuthData,
  createCliResetLink,
  eraseUser,
} from '@/modules/identity/service';
import { createDb, getDb } from '@/server/db';
import { runMigrations } from '@/server/db/migrate';
import { call, createUser, loginAs, tokenFromUrl, uniqueIp, uniquePhone } from './helpers';

/**
 * CLI service functions (admin:create, admin:reset-link, admin:erase-user) and auth.cleanup.
 * Bootstrap needs an empty database ("no admin yet"), so it runs in its own fresh database.
 */

const baseUrl = inject('databaseUrl');
const isolatedName = `uc_cli_${randomBytes(4).toString('hex')}`;
let isolated: ReturnType<typeof createDb>;

async function admin(statement: string) {
  const url = new URL(baseUrl);
  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await admin(`CREATE DATABASE ${isolatedName}`);
  const url = new URL(baseUrl);
  url.pathname = `/${isolatedName}`;
  await runMigrations(url.toString());
  isolated = createDb(url.toString(), { max: 3 });
});

afterAll(async () => {
  await isolated?.pool.end();
  await admin(`DROP DATABASE IF EXISTS ${isolatedName} WITH (FORCE)`);
});

describe('admin:create (bootstrap, SEC-T6)', () => {
  it('creates the first admin with a 1-hour setup link, then refuses', async () => {
    const phone = uniquePhone();
    const result = await bootstrapAdmin(
      { phone: `0${phone.slice(3)}`, displayName: 'مربی' },
      isolated.db,
    );
    expect(result.setupUrl).toMatch(/^https:\/\/app\.test\/invite#t=[A-Za-z0-9_-]{43}$/);
    const ttl = result.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000);

    const [row] = await isolated.db
      .select({ role: users.role, status: users.status, phone: users.phone })
      .from(users)
      .where(eq(users.id, result.userId));
    expect(row).toEqual({ role: 'admin', status: 'invited', phone });

    const [token] = await isolated.db
      .select({ createdBy: authTokens.createdBy })
      .from(authTokens)
      .where(eq(authTokens.userId, result.userId));
    expect(token?.createdBy).toBeNull();

    await expect(
      bootstrapAdmin({ phone: uniquePhone(), displayName: 'دومی' }, isolated.db),
    ).rejects.toBeInstanceOf(CliError);
  });

  it('refuses to erase the organization owner (the bootstrap admin, ADR-0011)', async () => {
    const [first] = await isolated.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (!first) throw new Error('no admin');
    await isolated.db.update(users).set({ status: 'active' }).where(eq(users.id, first.id));
    await expect(
      eraseUser(
        { userId: first.id, confirmDisplayName: 'مربی', requestedOn: '2026-10-20' },
        isolated.db,
      ),
    ).rejects.toThrow(/owns the organization/);
  });
});

describe('admin:reset-link (SEC-T7)', () => {
  it('creates a 1-hour reset link, clears the phone locks and audits with actor null', async () => {
    const user = await createUser('admin');
    // Lock the account globally.
    for (let i = 0; i < 20; i += 1) {
      await call('POST', '/auth/login', {
        body: { phone: user.phone, password: 'wrong-wrong-wrong' },
        ip: uniqueIp(),
      });
    }
    expect(
      (await call('POST', '/auth/login', { body: { phone: user.phone, password: user.password } }))
        .status,
    ).toBe(429);

    const result = await createCliResetLink({ phone: `0${user.phone.slice(3)}` });
    expect(result.resetUrl).toMatch(/\/reset#t=/);
    expect(result.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60_000);

    const keys = await getDb()
      .select({ key: authThrottle.key })
      .from(authThrottle)
      .where(sql`${authThrottle.key} LIKE ${`%${user.phone}%`}`);
    expect(keys).toEqual([]);
    expect(
      (await call('POST', '/auth/login', { body: { phone: user.phone, password: user.password } }))
        .status,
    ).toBe(200);

    const [audit] = await getDb()
      .select({ actorId: auditLog.actorId, data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.targetId, user.id), eq(auditLog.action, 'user.reset_link_created')));
    expect(audit).toEqual({ actorId: null, data: { via: 'cli', targetRole: 'admin' } });

    const accepted = await call('POST', '/auth/tokens/accept', {
      body: {
        token: tokenFromUrl(result.resetUrl),
        phone: user.phone,
        password: 'brand-new-admin-pass',
      },
    });
    expect(accepted.status).toBe(200);
  });

  it('refuses unknown and disabled phones', async () => {
    await expect(createCliResetLink({ phone: uniquePhone() })).rejects.toBeInstanceOf(CliError);
    const disabled = await createUser('mentor', { status: 'disabled' });
    await expect(createCliResetLink({ phone: disabled.phone })).rejects.toBeInstanceOf(CliError);
  });

  it('gives an invited user (expired bootstrap link) a fresh 1-hour invite link', async () => {
    const invited = await createUser('admin', { status: 'invited' });
    const result = await createCliResetLink({ phone: invited.phone });
    expect(result.purpose).toBe('invite');
    expect(result.resetUrl).toMatch(/\/invite#t=/);
    const accepted = await call('POST', '/auth/tokens/accept', {
      body: {
        token: tokenFromUrl(result.resetUrl),
        phone: invited.phone,
        password: 'first-admin-passphrase',
      },
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user.role).toBe('admin');
  });
});

describe('admin:erase-user (ADR-0010, identity part)', () => {
  it('anonymises the user, removes sessions and tokens, masks audit data; idempotent', async () => {
    const adminUser = await createUser('admin');
    const adminAuth = await loginAs(adminUser);
    const student = await createUser('student', { displayName: 'سارا رضایی' });
    const studentAuth = await loginAs(student);
    const reset = await call('POST', '/users/[id]/reset-link', {
      cookies: adminAuth.cookies,
      params: { id: student.id },
    });
    expect(reset.status).toBe(201);
    await recordAudit(getDb(), {
      actorId: student.id,
      action: 'auth.locked',
      targetType: 'user',
      targetId: student.id,
      data: { note: `phone ${student.phone}` },
      ip: '192.0.2.9',
    });

    await expect(
      eraseUser({
        userId: student.id,
        confirmDisplayName: 'نام اشتباه',
        requestedOn: '2026-10-20',
      }),
    ).rejects.toThrow(/confirm/);

    expect(
      await eraseUser({
        userId: student.id,
        confirmDisplayName: 'سارا رضايي',
        requestedOn: '2026-10-20',
      }),
    ).toBe('erased');

    const [row] = await getDb()
      .select({
        displayName: users.displayName,
        phone: users.phone,
        status: users.status,
        erasedAt: users.erasedAt,
      })
      .from(users)
      .where(eq(users.id, student.id));
    expect(row).toEqual({
      displayName: 'کاربر حذف‌شده',
      phone: `erased:${student.id}`,
      status: 'disabled',
      erasedAt: expect.any(Date),
    });
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, student.id))).toEqual(
      [],
    );
    expect(
      await getDb().select().from(authTokens).where(eq(authTokens.userId, student.id)),
    ).toEqual([]);

    // Canary: the phone no longer appears anywhere in audit_log; IP of their own rows cleared.
    const leaked = await getDb()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(sql`${auditLog.data}::text LIKE ${`%${student.phone.slice(3)}%`}`);
    expect(leaked).toEqual([]);
    const own = await getDb()
      .select({ ip: auditLog.ip, data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.actorId, student.id), eq(auditLog.action, 'auth.locked')));
    expect(own).toEqual([{ ip: null, data: { note: `phone +98•••••${student.phone.slice(-4)}` } }]);

    const [erasedAudit] = await getDb()
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.targetId, student.id), eq(auditLog.action, 'user.erased')));
    expect(erasedAudit?.data).toEqual({ requestedOn: '2026-10-20', via: 'cli' });

    expect((await call('GET', '/auth/me', { cookies: studentAuth.cookies })).status).toBe(401);
    expect(
      (
        await call('POST', '/auth/login', {
          body: { phone: student.phone, password: student.password },
        })
      ).status,
    ).toBe(401);
    // Write actions on an erased user → 409 (data-model.md 6-2).
    for (const p of ['/users/[id]/reset-link', '/users/[id]/invite-link'] as const) {
      expect(
        (await call('POST', p, { cookies: adminAuth.cookies, params: { id: student.id } })).status,
      ).toBe(409);
    }
    // GET /users shows the erasure without a phone.
    const list = await call('GET', '/users', {
      cookies: adminAuth.cookies,
      query: { role: 'student' },
    });
    const listed = list.body.items.find((u: { id: string }) => u.id === student.id);
    expect(listed).toMatchObject({
      phone: null,
      erasedAt: expect.any(String),
      displayName: 'کاربر حذف‌شده',
    });

    expect(
      await eraseUser({
        userId: student.id,
        confirmDisplayName: 'whatever',
        requestedOn: '2026-10-21',
      }),
    ).toBe('already_erased');
    // The phone can be invited again as a new person.
    const reinvite = await call('POST', '/invitations', {
      cookies: adminAuth.cookies,
      body: { role: 'mentor', displayName: 'دوباره', phone: student.phone },
    });
    expect(reinvite.status).toBe(201);
  });
});

describe('auth.cleanup retention (data-model.md 6-1)', () => {
  it('deletes stale sessions/tokens/throttle rows and clears old audit IPs', async () => {
    const user = await createUser('student');
    const long = new Date(Date.now() - 10 * 86400_000);
    await getDb()
      .insert(sessions)
      .values({
        organizationId: DEFAULT_ORGANIZATION_ID,
        userId: user.id,
        tokenHash: randomBytes(32).toString('hex'),
        createdAt: long,
        expiresAt: long,
        lastUsedAt: long,
      });
    const fresh = await loginAs(user);
    await getDb()
      .insert(authThrottle)
      .values({
        key: `login:ip:test-${randomBytes(3).toString('hex')}`,
        failures: 3,
        windowStartedAt: long,
      });
    await getDb()
      .insert(auditLog)
      .values({
        action: 'auth.locked',
        targetType: 'user',
        targetId: user.id,
        ip: '192.0.2.200',
        createdAt: new Date(Date.now() - 100 * 86400_000),
      });

    await cleanupAuthData();

    const remaining = await getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(remaining).toHaveLength(1);
    expect((await call('GET', '/auth/me', { cookies: fresh.cookies })).status).toBe(200);
    const stale = await getDb()
      .select({ key: authThrottle.key })
      .from(authThrottle)
      .where(sql`${authThrottle.windowStartedAt} < ${new Date(Date.now() - 2 * 3600_000)}`);
    expect(stale).toEqual([]);
    const old = await getDb()
      .select({ ip: auditLog.ip })
      .from(auditLog)
      .where(and(eq(auditLog.targetId, user.id), eq(auditLog.action, 'auth.locked')));
    expect(old).toEqual([{ ip: null }]);
  });
});
