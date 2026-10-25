import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { auditLog } from '@/modules/admin/schema';
import { authTokens } from '@/modules/identity/schema';
import { sha256Hex } from '@/modules/identity/tokens';
import { getDb } from '@/server/db';
import { call, createUser, loginAs, tokenFromUrl, uniqueIp, uniquePhone } from './helpers';

/** T-TOKEN (security.md section 6) and C1. */

async function inviteMentor() {
  const admin = await createUser('admin');
  const auth = await loginAs(admin);
  const phone = uniquePhone();
  const res = await call('POST', '/invitations', {
    cookies: auth.cookies,
    body: { role: 'mentor', displayName: 'مشاور تازه', phone },
  });
  expect(res.status).toBe(201);
  return {
    adminCookies: auth.cookies,
    userId: res.body.userId as string,
    phone,
    token: tokenFromUrl(res.body.inviteUrl),
  };
}

const accept = (token: string, phone: string, ip = uniqueIp()) =>
  call('POST', '/auth/tokens/accept', {
    body: { token, phone, password: 'mentor-good-passphrase' },
    ip,
  });

describe('invite and reset tokens', () => {
  it('stores only the SHA-256 of the token', async () => {
    const { userId, token } = await inviteMentor();
    const rows = await getDb()
      .select({ tokenHash: authTokens.tokenHash })
      .from(authTokens)
      .where(eq(authTokens.userId, userId));
    expect(rows).toEqual([{ tokenHash: sha256Hex(token) }]);
  });

  it('expired → 410 on lookup and accept', async () => {
    const { userId, phone, token } = await inviteMentor();
    await getDb()
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authTokens.userId, userId));
    expect((await call('POST', '/auth/tokens/lookup', { body: { token } })).status).toBe(410);
    expect((await accept(token, phone)).status).toBe(410);
  });

  it('unknown and malformed tokens → the same 410', async () => {
    const a = await call('POST', '/auth/tokens/lookup', { body: { token: 'x'.repeat(43) } });
    const b = await call('POST', '/auth/tokens/lookup', { body: { token: 'not a token' } });
    expect(a.status).toBe(410);
    expect(b.status).toBe(410);
    expect(a.body).toEqual(b.body);
  });

  it('re-creating the invite link revokes the previous one', async () => {
    const { adminCookies, userId, phone, token } = await inviteMentor();
    const again = await call('POST', '/users/[id]/invite-link', {
      cookies: adminCookies,
      params: { id: userId },
    });
    expect(again.status).toBe(201);
    expect(again.headers.get('cache-control')).toBe('private, no-store');
    expect((await call('POST', '/auth/tokens/lookup', { body: { token } })).status).toBe(410);
    expect((await accept(tokenFromUrl(again.body.inviteUrl), phone)).status).toBe(200);
    // Now the user is active: another invite link is a conflict.
    const third = await call('POST', '/users/[id]/invite-link', {
      cookies: adminCookies,
      params: { id: userId },
    });
    expect(third.status).toBe(409);
  });

  it('5 wrong phones revoke the token (SEC-T4); the right phone then gets 410', async () => {
    const { userId, phone, token } = await inviteMentor();
    for (let i = 0; i < 5; i += 1) {
      const res = await accept(token, uniquePhone());
      expect(res.status).toBe(422);
      expect(res.body.error.fields.phone).toBe('این شماره با این لینک هم‌خوانی ندارد');
    }
    expect((await accept(token, phone)).status).toBe(410);
    const audits = await getDb()
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(
        and(eq(auditLog.targetId, userId), eq(auditLog.action, 'auth.token_revoked_mismatch')),
      );
    expect(audits).toEqual([{ data: { purpose: 'invite' } }]);
  });

  it('two concurrent accepts: exactly one succeeds (SEC-T2)', async () => {
    const { phone, token } = await inviteMentor();
    const results = await Promise.all([accept(token, phone), accept(token, phone)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
  });

  it('rate-limits failed lookups per IP: 30 in 15 minutes (SEC-R3)', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 30; i += 1) {
      expect(
        (await call('POST', '/auth/tokens/lookup', { body: { token: 'y'.repeat(43) }, ip })).status,
      ).toBe(410);
    }
    const { token } = await inviteMentor();
    const locked = await call('POST', '/auth/tokens/lookup', { body: { token }, ip });
    expect(locked.status).toBe(429);
    // Another IP still works.
    expect(
      (await call('POST', '/auth/tokens/lookup', { body: { token }, ip: uniqueIp() })).status,
    ).toBe(200);
  });

  it('rejects unknown keys in the body (strict schemas, SEC-A7)', async () => {
    const res = await call('POST', '/auth/tokens/lookup', { body: { token: 'z', extra: 1 } });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.extra).toBe('فیلد ناشناخته');
  });

  it('an admin cannot create a reset link for an invited user (needs an invite link)', async () => {
    const { adminCookies, userId } = await inviteMentor();
    const res = await call('POST', '/users/[id]/reset-link', {
      cookies: adminCookies,
      params: { id: userId },
    });
    expect(res.status).toBe(409);
  });

  it('PHONE_TAKEN for a duplicate phone, in any format', async () => {
    const { adminCookies, phone } = await inviteMentor();
    const res = await call('POST', '/invitations', {
      cookies: adminCookies,
      body: { role: 'admin', displayName: 'تکراری', phone: `0${phone.slice(3)}` },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });
});
