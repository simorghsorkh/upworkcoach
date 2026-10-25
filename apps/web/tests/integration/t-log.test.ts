import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as jobTrigger from '@/app/api/internal/jobs/[name]/route';
import { users } from '@/modules/identity/schema';
import { getDb } from '@/server/db';
import { logger } from '@/server/logger';
import { formWith, imageBytes } from './fixtures';
import {
  call,
  createUser,
  DEVICE_COOKIE,
  localForm,
  loginAs,
  ORIGIN,
  SESSION_COOKIE,
  tokenFromUrl,
  uniqueIp,
  uniquePhone,
} from './helpers';

/**
 * T-LOG (security.md section 6, followup F-05): everything logged during a whole flow —
 * invite → accept → failed login → login → search by phone → upload → CSV exports →
 * CSV import (with invite links in the answer) → internal job call with a secret — must not
 * contain a full phone, an invite token or link, a cookie value, an argon2 hash or the
 * X-Job-Secret value.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const JOB_SECRET = 'job-secret-value-that-must-never-be-logged-0123456789';

describe('T-LOG: a whole flow leaks nothing to the logs', () => {
  it('invite, accept, login, search, upload, CSV out and in, job trigger', async () => {
    const logged: string[] = [];
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
        logged.push(JSON.stringify(args));
      }) as never);
    }
    const secrets: string[] = [];

    const admin = await createUser('admin');
    const adminAuth = await loginAs(admin);
    secrets.push(adminAuth.session, adminAuth.device);

    // 1. Invite a student (the link carries the token).
    const phone = uniquePhone();
    secrets.push(phone, phone.slice(1), localForm(phone));
    const created = await call('POST', '/students', {
      cookies: adminAuth.cookies,
      body: { displayName: 'هنرجوی لاگ', phone: localForm(phone) },
    });
    expect(created.status).toBe(201);
    const token = tokenFromUrl(created.body.inviteUrl);
    secrets.push(token, created.body.inviteUrl);

    // 2. Accept.
    const ip = uniqueIp();
    expect((await call('POST', '/auth/tokens/lookup', { body: { token }, ip })).status).toBe(200);
    const password = 'student-log-pass-1';
    secrets.push(password);
    const accepted = await call('POST', '/auth/tokens/accept', {
      body: { token, phone: localForm(phone), password },
      ip,
    });
    expect(accepted.status).toBe(200);
    secrets.push(accepted.cookies[SESSION_COOKIE] ?? '', accepted.cookies[DEVICE_COOKIE] ?? '');

    // 3. A failed login (known and unknown phone), then a real one.
    const unknown = uniquePhone();
    secrets.push(unknown, localForm(unknown));
    for (const p of [phone, unknown]) {
      const failed = await call('POST', '/auth/login', {
        body: { phone: localForm(p), password: 'wrong-password-123' },
      });
      expect(failed.status).toBe(401);
    }
    const login = await call('POST', '/auth/login', { body: { phone, password } });
    expect(login.status).toBe(200);
    const studentSession = login.cookies[SESSION_COOKIE] ?? '';
    secrets.push(studentSession);

    // 4. Staff search by phone (query string).
    const search = await call('GET', '/students', {
      cookies: adminAuth.cookies,
      query: { q: localForm(phone) },
    });
    expect(search.body.items).toHaveLength(1);

    // 5. Upload.
    const upload = await call('POST', '/attachments', {
      cookies: { [SESSION_COOKIE]: studentSession },
      form: formWith(await imageBytes()),
    });
    expect(upload.status).toBe(201);

    // 6. CSV exports (phones inside the files).
    for (const file of ['/exports/students.csv', '/exports/tasks.csv', '/exports/milestones.csv']) {
      expect((await call('GET', file, { cookies: adminAuth.cookies })).status).toBe(200);
    }

    // 7. CSV import: one valid row (its invite link is in the answer) and one invalid phone.
    const importPhone = uniquePhone();
    secrets.push(importPhone, localForm(importPhone));
    const form = new FormData();
    const csv = `نام,موبایل\nورودی لاگ,${localForm(importPhone)}\nبد,09${'1'.repeat(5)}\n`;
    form.set('file', new File([csv], 'students.csv', { type: 'text/csv' }));
    form.set('dryRun', 'false');
    const imported = await call('POST', '/imports/students', { cookies: adminAuth.cookies, form });
    expect(imported.status).toBe(200);
    const importedUrl = imported.body.rows.find((r: { ok: boolean }) => r.ok)?.inviteUrl as string;
    secrets.push(importedUrl, tokenFromUrl(importedUrl));

    // 8. The internal job endpoint with a secret header (404 unless http-trigger).
    const job = await jobTrigger.POST(
      new Request(`${ORIGIN}/api/internal/jobs/health.sweep`, {
        method: 'POST',
        headers: { 'x-job-secret': JOB_SECRET },
      }),
      { params: Promise.resolve({ name: 'health.sweep' }) },
    );
    expect(job.status).toBe(404);
    // And the same header on an ordinary API request.
    await call('GET', '/auth/me', {
      cookies: adminAuth.cookies,
      headers: { 'x-job-secret': JOB_SECRET },
    });
    secrets.push(JOB_SECRET);

    const [hashRow] = await getDb()
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.phone, phone));
    secrets.push(hashRow?.hash ?? '');

    const all = logged.join('\n');
    expect(all).toContain('auth.login_succeeded');
    expect(all).toContain('http.request');
    expect(all).not.toMatch(/(\+98|0098|0)9\d{9}/);
    expect(all).not.toContain('$argon2id$');
    for (const secret of secrets.filter((s) => s.length >= 8)) expect(all).not.toContain(secret);
  });
});
