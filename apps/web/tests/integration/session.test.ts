import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { sessions, users } from '@/modules/identity/schema';
import { getDb } from '@/server/db';
import { call, createUser, loginAs, SESSION_COOKIE } from './helpers';

/** T-SESSION (security.md section 6) — validation on every request, SEC-S2/S3. */

const DAY = 86400_000;

async function sessionOf(userId: string) {
  const [row] = await getDb()
    .select({ id: sessions.id, expiresAt: sessions.expiresAt, lastUsedAt: sessions.lastUsedAt })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  if (!row) throw new Error('no session');
  return row;
}

describe('session validation', () => {
  it('staff sessions end at the 30-day absolute cap, student sessions do not', async () => {
    const mentor = await createUser('mentor');
    const student = await createUser('student');
    const m = await loginAs(mentor);
    const s = await loginAs(student);
    const created = new Date(Date.now() - 31 * DAY);
    const farFuture = new Date(Date.now() + 5 * DAY);
    for (const id of [mentor.id, student.id]) {
      await getDb()
        .update(sessions)
        .set({ createdAt: created, expiresAt: farFuture })
        .where(eq(sessions.userId, id));
      await getDb()
        .update(users)
        .set({ passwordChangedAt: new Date(created.getTime() - DAY) })
        .where(eq(users.id, id));
    }
    expect((await call('GET', '/auth/me', { cookies: m.cookies })).status).toBe(401);
    expect((await call('GET', '/auth/me', { cookies: s.cookies })).status).toBe(200);
  });

  it('a sliding-expired session is refused', async () => {
    const student = await createUser('student');
    const s = await loginAs(student);
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, student.id));
    expect((await call('GET', '/auth/me', { cookies: s.cookies })).status).toBe(401);
  });

  it('sessions older than password_changed_at are refused', async () => {
    const student = await createUser('student');
    const s = await loginAs(student);
    await getDb()
      .update(users)
      .set({ passwordChangedAt: new Date(Date.now() + 1000) })
      .where(eq(users.id, student.id));
    expect((await call('GET', '/auth/me', { cookies: s.cookies })).status).toBe(401);
  });

  it('the role comes from users on every request, not from the session', async () => {
    const user = await createUser('mentor');
    const s = await loginAs(user);
    expect((await call('GET', '/users', { cookies: s.cookies })).status).toBe(403);
    await getDb().update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
    // (A real role change also revokes sessions — PATCH /users/:id/role, sprint 2.)
    expect((await call('GET', '/users', { cookies: s.cookies })).status).toBe(200);
  });

  it('extends the sliding expiry at most every 15 minutes', async () => {
    const student = await createUser('student');
    const s = await loginAs(student);
    const first = await sessionOf(student.id);

    await call('GET', '/auth/me', { cookies: s.cookies });
    expect((await sessionOf(student.id)).expiresAt).toEqual(first.expiresAt);

    await getDb()
      .update(sessions)
      .set({
        lastUsedAt: new Date(Date.now() - 20 * 60_000),
        expiresAt: new Date(Date.now() + DAY),
      })
      .where(eq(sessions.id, first.id));
    await call('GET', '/auth/me', { cookies: s.cookies });
    const touched = await sessionOf(student.id);
    expect(touched.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(Date.now() - touched.lastUsedAt.getTime()).toBeLessThan(60_000);
  });

  it('ignores a session token sent anywhere but the cookie (SEC-S6)', async () => {
    const student = await createUser('student');
    const s = await loginAs(student);
    const res = await call('GET', '/auth/me', {
      headers: { authorization: `Bearer ${s.session}`, 'x-session': s.session },
    });
    expect(res.status).toBe(401);
    // And a garbage cookie value is simply "no session".
    expect(
      (await call('GET', '/auth/me', { cookies: { [SESSION_COOKIE]: 'garbage' } })).status,
    ).toBe(401);
  });
});

describe('change password and own devices (api.md section 2, SEC-S4, SEC-F3)', () => {
  it('change-password rotates the current session and revokes all others', async () => {
    const user = await createUser('mentor');
    const phoneA = await loginAs(user);
    const laptop = await loginAs(user);

    const wrongCurrent = await call('POST', '/auth/change-password', {
      cookies: phoneA.cookies,
      body: { currentPassword: 'nope-nope-nope', newPassword: 'a-new-mentor-passphrase' },
    });
    expect(wrongCurrent.status).toBe(422);
    expect(wrongCurrent.body.error.fields.currentPassword).toBe('رمز فعلی درست نیست.');

    const tooShort = await call('POST', '/auth/change-password', {
      cookies: phoneA.cookies,
      body: { currentPassword: user.password, newPassword: 'short-one' },
    });
    expect(tooShort.status).toBe(422);
    expect(tooShort.body.error.fields.newPassword).toMatch(/۱۲/);

    const changed = await call('POST', '/auth/change-password', {
      cookies: phoneA.cookies,
      body: { currentPassword: user.password, newPassword: 'a-new-mentor-passphrase' },
    });
    expect(changed.status).toBe(204);
    const rotated = changed.cookies[SESSION_COOKIE];
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(phoneA.session);

    expect((await call('GET', '/auth/me', { cookies: phoneA.cookies })).status).toBe(401);
    expect((await call('GET', '/auth/me', { cookies: laptop.cookies })).status).toBe(401);
    expect(
      (await call('GET', '/auth/me', { cookies: { [SESSION_COOKIE]: rotated ?? '' } })).status,
    ).toBe(200);
    expect(
      (
        await call('POST', '/auth/login', {
          body: { phone: user.phone, password: 'a-new-mentor-passphrase' },
        })
      ).status,
    ).toBe(200);
  });

  it('locks change-password after 5 wrong current passwords', async () => {
    const user = await createUser('student');
    const s = await loginAs(user);
    for (let i = 0; i < 5; i += 1) {
      const res = await call('POST', '/auth/change-password', {
        cookies: s.cookies,
        body: { currentPassword: 'wrong-wrong', newPassword: 'whatever-new-1' },
      });
      expect(res.status).toBe(422);
    }
    const locked = await call('POST', '/auth/change-password', {
      cookies: s.cookies,
      body: { currentPassword: user.password, newPassword: 'whatever-new-1' },
    });
    expect(locked.status).toBe(429);
  });

  it('lists only own sessions and revokes only own sessions (others → 404)', async () => {
    const user = await createUser('student');
    const other = await createUser('student');
    const a = await loginAs(user);
    const b = await loginAs(user);
    await loginAs(other);

    const list = await call('GET', '/auth/sessions', { cookies: a.cookies });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(a.session);

    const otherSessions = await getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, other.id));
    const foreign = await call('DELETE', '/auth/sessions/[id]', {
      cookies: a.cookies,
      params: { id: otherSessions[0]?.id ?? '' },
    });
    expect(foreign.status).toBe(404);
    const missing = await call('DELETE', '/auth/sessions/[id]', {
      cookies: a.cookies,
      params: { id: '01900000-0000-7000-8000-00000000abcd' },
    });
    expect(missing.body).toEqual(foreign.body);

    const bId = list.body.find((s: { current: boolean }) => !s.current).id;
    const revoked = await call('DELETE', '/auth/sessions/[id]', {
      cookies: a.cookies,
      params: { id: bId },
    });
    expect(revoked.status).toBe(204);
    expect((await call('GET', '/auth/me', { cookies: b.cookies })).status).toBe(401);
    expect((await call('GET', '/auth/me', { cookies: a.cookies })).status).toBe(200);
  });
});
