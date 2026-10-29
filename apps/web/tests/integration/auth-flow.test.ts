import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditLog } from '@/modules/admin/schema';
import { DEFAULT_ORGANIZATION_ID, sessions, users } from '@/modules/identity/schema';
import { getDb } from '@/server/db';
import { logger } from '@/server/logger';
import {
  call,
  createUser,
  DEVICE_COOKIE,
  localForm,
  loginAs,
  SESSION_COOKIE,
  tokenFromUrl,
  uniqueIp,
  uniquePhone,
} from './helpers';

describe('invite → accept → login → me → logout (ADR-0003)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the whole flow for a new mentor, without leaking secrets to logs', async () => {
    // T-LOG (partial): collect everything passed to the logger during the flow.
    const logged: string[] = [];
    for (const level of ['info', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
        logged.push(JSON.stringify(args));
      }) as never);
    }

    const admin = await createUser('admin');
    const adminAuth = await loginAs(admin);

    // 1. Admin invites a mentor; the link carries the token only in the fragment (C1).
    const phone = uniquePhone();
    const invited = await call('POST', '/invitations', {
      cookies: adminAuth.cookies,
      body: {
        role: 'mentor',
        displayName: '  مريم   كاظمي ',
        phone: localForm(phone).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d),
      },
    });
    expect(invited.status).toBe(201);
    expect(invited.headers.get('cache-control')).toBe('private, no-store');
    expect(invited.body.inviteUrl).toMatch(/^https:\/\/app\.test\/invite#t=[A-Za-z0-9_-]{43}$/);
    const token = tokenFromUrl(invited.body.inviteUrl);

    const [stored] = await getDb()
      .select({ phone: users.phone, displayName: users.displayName, status: users.status })
      .from(users)
      .where(eq(users.id, invited.body.userId));
    expect(stored).toEqual({ phone, displayName: 'مریم کاظمی', status: 'invited' });

    // The audit row has no link or token.
    const audits = await getDb()
      .select({ action: auditLog.action, data: auditLog.data })
      .from(auditLog)
      .where(eq(auditLog.targetId, invited.body.userId));
    expect(audits.map((a) => a.action).sort()).toEqual([
      'user.invite_link_created',
      'user.invited',
    ]);
    expect(JSON.stringify(audits)).not.toContain(token);

    // 2. Lookup: name and purpose, never the phone.
    const ip = uniqueIp();
    const lookup = await call('POST', '/auth/tokens/lookup', { body: { token }, ip });
    expect(lookup.status).toBe(200);
    expect(lookup.body).toEqual({
      purpose: 'invite',
      displayName: 'مریم کاظمی',
      expiresAt: expect.any(String),
    });
    expect(JSON.stringify(lookup.body)).not.toContain(phone.slice(-4));

    // 3. Accept with a wrong phone → 422; weak password → 422; neither consumes the token.
    const wrongPhone = await call('POST', '/auth/tokens/accept', {
      body: { token, phone: uniquePhone(), password: 'a-very-long-mentor-pass' },
      ip,
    });
    expect(wrongPhone.status).toBe(422);
    expect(wrongPhone.body.error.fields.phone).toBe('این شماره با این لینک هم‌خوانی ندارد');

    const shortPassword = await call('POST', '/auth/tokens/accept', {
      body: { token, phone: localForm(phone), password: 'short-pass' },
      ip,
    });
    expect(shortPassword.status).toBe(422);
    expect(shortPassword.body.error.fields.password).toMatch(/۱۲/);

    // 4. Accept with the phone in another format and a good password.
    const accepted = await call('POST', '/auth/tokens/accept', {
      body: { token, phone: localForm(phone), password: 'a-very-long-mentor-pass' },
      ip,
      userAgent: 'Mozilla/5.0 (Android 14) Mobile',
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user).toEqual({
      id: invited.body.userId,
      displayName: 'مریم کاظمی',
      role: 'mentor',
      phone,
      locale: 'fa',
      organization: {
        id: DEFAULT_ORGANIZATION_ID,
        name: expect.any(String),
        role: 'mentor',
        timeZone: 'Asia/Tehran',
      },
    });
    const sessionCookie = accepted.setCookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(sessionCookie).toMatch(/; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax; Secure$/);
    expect(sessionCookie?.toLowerCase()).not.toContain('domain');
    // Staff cookies live at most 30 days (absolute cap; the server enforces 7-day sliding).
    const maxAge = Number(/Max-Age=(\d+)/.exec(sessionCookie ?? '')?.[1]);
    expect(maxAge).toBeGreaterThan(29 * 86400);
    expect(maxAge).toBeLessThanOrEqual(30 * 86400);
    expect(accepted.cookies[DEVICE_COOKIE]).toBeTruthy();

    // The token is single-use.
    const again = await call('POST', '/auth/tokens/accept', {
      body: { token, phone, password: 'a-very-long-mentor-pass' },
      ip,
    });
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe('TOKEN_EXPIRED');

    // 5. me
    const mentorCookies = { [SESSION_COOKIE]: accepted.cookies[SESSION_COOKIE] };
    const meRes = await call('GET', '/auth/me', { cookies: mentorCookies });
    expect(meRes.status).toBe(200);
    expect(meRes.body.role).toBe('mentor');

    // GET /users shows when and on what device the invite was accepted (SEC-T5).
    const list = await call('GET', '/users', {
      cookies: adminAuth.cookies,
      query: { role: 'mentor' },
    });
    const row = list.body.items.find((u: { id: string }) => u.id === invited.body.userId);
    expect(row.status).toBe('active');
    expect(row.inviteAcceptedAt).toEqual(expect.any(String));
    expect(row.inviteAcceptedDevice).toBe('Mozilla/5.0 (Android 14) Mobile');

    // 6. Password login works with Persian digits in the phone.
    const relogin = await call('POST', '/auth/login', {
      body: {
        phone: localForm(phone).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d),
        password: 'a-very-long-mentor-pass',
      },
    });
    expect(relogin.status).toBe(200);

    // 7. Logout revokes the session and clears the cookie.
    const out = await call('POST', '/auth/logout', { cookies: mentorCookies });
    expect(out.status).toBe(204);
    expect(out.headers.get('clear-site-data')).toBe('"cache"');
    expect(out.setCookies).toEqual([
      `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
    ]);
    expect((await call('GET', '/auth/me', { cookies: mentorCookies })).status).toBe(401);
    // The other session (relogin) is still valid.
    expect(
      (
        await call('GET', '/auth/me', {
          cookies: { [SESSION_COOKIE]: relogin.cookies[SESSION_COOKIE] },
        })
      ).status,
    ).toBe(200);

    // T-LOG: no full phone, token, session cookie or argon2 hash in anything logged.
    const all = logged.join('\n');
    expect(all).not.toMatch(/(\+98|0098|0)9\d{9}/);
    expect(all).not.toContain(token);
    expect(all).not.toContain(accepted.cookies[SESSION_COOKIE]);
    expect(all).not.toContain('$argon2id$');
    expect(all).toContain('auth.login_succeeded');
  });

  it('password reset: admin link → new password; old sessions and password stop working', async () => {
    const admin = await createUser('admin');
    const adminAuth = await loginAs(admin);
    const student = await createUser('student');
    const studentAuth = await loginAs(student);

    const reset = await call('POST', '/users/[id]/reset-link', {
      cookies: adminAuth.cookies,
      params: { id: student.id },
    });
    expect(reset.status).toBe(201);
    expect(reset.headers.get('cache-control')).toBe('private, no-store');
    expect(reset.body.resetUrl).toMatch(/^https:\/\/app\.test\/reset#t=/);
    const expiresIn = new Date(reset.body.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(23.9 * 3600_000);
    expect(expiresIn).toBeLessThanOrEqual(24 * 3600_000);

    const token = tokenFromUrl(reset.body.resetUrl);
    const lookup = await call('POST', '/auth/tokens/lookup', { body: { token } });
    expect(lookup.body.purpose).toBe('password_reset');

    // The browser opening the link is still signed in as the admin (coach testing the link):
    // accepting signs that session out too (ADR-0003 section 2).
    const accepted = await call('POST', '/auth/tokens/accept', {
      body: { token, phone: student.phone, password: 'new-student-pass' },
      cookies: adminAuth.cookies,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.user.id).toBe(student.id);

    expect((await call('GET', '/auth/me', { cookies: studentAuth.cookies })).status).toBe(401);
    expect((await call('GET', '/auth/me', { cookies: adminAuth.cookies })).status).toBe(401);
    expect(
      (
        await call('GET', '/auth/me', {
          cookies: { [SESSION_COOKIE]: accepted.cookies[SESSION_COOKIE] },
        })
      ).status,
    ).toBe(200);

    const oldPassword = await call('POST', '/auth/login', {
      body: { phone: student.phone, password: student.password },
    });
    expect(oldPassword.status).toBe(401);
    const newPassword = await call('POST', '/auth/login', {
      body: { phone: student.phone, password: 'new-student-pass' },
    });
    expect(newPassword.status).toBe(200);

    const revokedAudit = await getDb()
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.targetId, student.id), eq(auditLog.action, 'session.revoked_all')));
    expect(revokedAudit).toHaveLength(1);
  });

  it('stores sessions with hashed tokens, IP from the trusted proxy and role-based expiry', async () => {
    const student = await createUser('student');
    const res = await call('POST', '/auth/login', {
      body: { phone: student.phone, password: student.password },
      ip: '6.6.6.6, 192.0.2.44',
    });
    expect(res.status).toBe(200);
    const [row] = await getDb()
      .select({ tokenHash: sessions.tokenHash, ip: sessions.ip, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.userId, student.id));
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.tokenHash).not.toBe(res.cookies[SESSION_COOKIE]);
    expect(row?.ip).toBe('192.0.2.44');
    const days = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });
});
