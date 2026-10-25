import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditLog } from '@/modules/admin/schema';
import { dummyVerifier } from '@/modules/identity/password';
import { getDb } from '@/server/db';
import { call, createUser, DEVICE_COOKIE, loginAs, uniqueIp, uniquePhone } from './helpers';

/** T-AUTH (security.md section 6): three-layer lockout, ADR-0003 section 4. */

const wrong = (phone: string, ip: string, extra: Parameters<typeof call>[2] = {}) =>
  call('POST', '/auth/login', { body: { phone, password: 'wrong-password-123' }, ip, ...extra });

describe('login lockout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('locks phone+IP exactly after 5 failures; the right password is then refused too', async () => {
    const user = await createUser('mentor');
    const ip = uniqueIp();
    for (let i = 0; i < 5; i += 1) {
      const res = await wrong(user.phone, ip);
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'موبایل یا رمز درست نیست.',
      });
    }
    const locked = await call('POST', '/auth/login', {
      body: { phone: user.phone, password: user.password },
      ip,
    });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(locked.body.error.retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect(locked.headers.get('retry-after')).toBe(String(locked.body.error.retryAfterSeconds));
    expect(Object.keys(locked.body.error).sort()).toEqual(['code', 'message', 'retryAfterSeconds']);

    // Same phone from another IP is not affected by the phone+IP layer.
    await expect(loginAs(user, uniqueIp())).resolves.toBeTruthy();

    // SEC-L7: the lock of an existing account is audited.
    const audits = await getDb()
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(and(eq(auditLog.targetId, user.id), eq(auditLog.action, 'auth.locked')));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.data).toEqual({ layers: ['phone_ip'] });
  });

  it('treats unknown phones exactly the same (no account enumeration, SEC-R6)', async () => {
    const spy = vi.spyOn(dummyVerifier, 'verify');
    const ip = uniqueIp();
    const phone = uniquePhone();
    for (let i = 0; i < 5; i += 1) expect((await wrong(phone, ip)).status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(5);
    const locked = await wrong(phone, ip);
    expect(locked.status).toBe(429);
    expect(Object.keys(locked.body.error).sort()).toEqual(['code', 'message', 'retryAfterSeconds']);
  });

  it('verifies the dummy hash for invited and disabled accounts', async () => {
    const spy = vi.spyOn(dummyVerifier, 'verify');
    const invited = await createUser('student', { status: 'invited' });
    const disabled = await createUser('student', { status: 'disabled' });
    expect(
      (
        await call('POST', '/auth/login', {
          body: { phone: invited.phone, password: invited.password },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call('POST', '/auth/login', {
          body: { phone: disabled.phone, password: disabled.password },
        })
      ).status,
    ).toBe(401);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a successful login clears the phone+IP counter', async () => {
    const user = await createUser('student');
    const ip = uniqueIp();
    for (let i = 0; i < 4; i += 1) await wrong(user.phone, ip);
    await loginAs(user, ip);
    for (let i = 0; i < 4; i += 1) expect((await wrong(user.phone, ip)).status).toBe(401);
  });

  it('global phone lock after 20 failures; the owner passes with a valid device cookie (C2)', async () => {
    const user = await createUser('admin');
    const ownDevice = (await loginAs(user)).device;
    expect(ownDevice).toBeTruthy();

    // Attacker spreads 20 failures over 5 IPs (4 each, below the phone+IP limit).
    for (let i = 0; i < 20; i += 1) {
      const ipBase = `192.0.2.${10 + Math.floor(i / 4)}`;
      expect((await wrong(user.phone, ipBase)).status).toBe(401);
    }
    const fresh = uniqueIp();
    const blocked = await call('POST', '/auth/login', {
      body: { phone: user.phone, password: user.password },
      ip: fresh,
    });
    expect(blocked.status).toBe(429);

    // Device cookie of ANOTHER user does not help.
    const other = await createUser('student');
    const otherDevice = (await loginAs(other)).device;
    const withOtherDevice = await call('POST', '/auth/login', {
      body: { phone: user.phone, password: user.password },
      ip: fresh,
      cookies: { [DEVICE_COOKIE]: otherDevice },
    });
    expect(withOtherDevice.status).toBe(429);

    // A forged cookie does not help either.
    const forged = await call('POST', '/auth/login', {
      body: { phone: user.phone, password: user.password },
      ip: fresh,
      cookies: { [DEVICE_COOKIE]: `${Buffer.from(user.id).toString('base64url')}.AAAA` },
    });
    expect(forged.status).toBe(429);

    const owner = await call('POST', '/auth/login', {
      body: { phone: user.phone, password: user.password },
      ip: fresh,
      cookies: { [DEVICE_COOKIE]: ownDevice },
    });
    expect(owner.status).toBe(200);
  });

  it('IP lock after 30 failures across phones; a spoofed left X-Forwarded-For does not bypass it', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 30; i += 1) {
      expect((await wrong(uniquePhone(), ip)).status).toBe(401);
    }
    const user = await createUser('student');
    // Attacker prepends a fake client IP; only the right-most (proxy-added) value counts.
    const spoofed = await call('POST', '/auth/login', {
      body: { phone: user.phone, password: user.password },
      ip: `${uniqueIp()}, ${ip}`,
    });
    expect(spoofed.status).toBe(429);
  });

  it('normalises the phone before building keys (0912… and +98912… share one counter)', async () => {
    const user = await createUser('student');
    const ip = uniqueIp();
    const local = `0${user.phone.slice(3)}`;
    for (let i = 0; i < 3; i += 1) await wrong(local, ip);
    for (let i = 0; i < 2; i += 1) await wrong(user.phone, ip);
    expect((await wrong(`0098${user.phone.slice(3)}`, ip)).status).toBe(429);
  });

  it('rejects a malformed phone with 422 before anything else', async () => {
    const res = await wrong('12345', uniqueIp());
    expect(res.status).toBe(422);
    expect(res.body.error.fields.phone).toBe('شماره‌ی موبایل معتبر نیست');
  });
});
