import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrganization } from '@/modules/identity/organizations';
import { userPreferences } from '@/modules/identity/schema';
import { CliError } from '@/modules/identity/service';
import { getDb } from '@/server/db';
import { call, createUser, loginAs, type TestUser } from './helpers';

/**
 * ADR-0013 (SaaS sprint 2): the interface language of an account, the organization default,
 * the `uc_locale` cookie of the browser and API errors in the request's language.
 */

let mentor: TestUser;
let cookies: Record<string, string>;

beforeAll(async () => {
  mentor = await createUser('mentor');
  cookies = (await loginAs(mentor)).cookies;
});

describe('PATCH /auth/preferences', () => {
  it('stores the language, returns it in /auth/me and sets the locale cookie', async () => {
    const before = await call('GET', '/auth/me', { cookies });
    expect(before.body.locale).toBe('fa');
    expect(before.body.organization.timeZone).toBe('Asia/Tehran');

    const res = await call('PATCH', '/auth/preferences', { cookies, body: { locale: 'en' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locale: 'en' });
    const cookie = res.setCookies.find((c) => c.startsWith('uc_locale='));
    expect(cookie).toMatch(/^uc_locale=en; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Lax/);

    expect((await call('GET', '/auth/me', { cookies })).body.locale).toBe('en');
    const [row] = await getDb()
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, mentor.id));
    expect(row?.locale).toBe('en');

    // Signing in again sends the account's language to the browser.
    const login = await call('POST', '/auth/login', {
      body: { phone: mentor.phone, password: mentor.password },
    });
    expect(login.cookies.uc_locale).toBe('en');

    await call('PATCH', '/auth/preferences', { cookies, body: { locale: 'fa' } });
    expect((await call('GET', '/auth/me', { cookies })).body.locale).toBe('fa');
  });

  it('refuses an unsupported language and anonymous requests', async () => {
    const bad = await call('PATCH', '/auth/preferences', { cookies, body: { locale: 'de' } });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields)).toEqual(['locale']);
    const anonymous = await call('PATCH', '/auth/preferences', { body: { locale: 'en' } });
    expect(anonymous.status).toBe(401);
  });
});

describe('API errors in the request language', () => {
  it('Persian by default, English with Accept-Language: en', async () => {
    const fa = await call('PATCH', '/auth/preferences', { cookies, body: { locale: 'de' } });
    expect(fa.body.error.message).toBe('بعضی از مقدارها درست نیستند.');
    expect(fa.body.error.fields.locale).toBe('مقدار نامعتبر است');

    const en = await call('PATCH', '/auth/preferences', {
      cookies,
      body: { locale: 'de', extra: 1 },
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    });
    expect(en.body.error.code).toBe('VALIDATION_FAILED');
    expect(en.body.error.message).toBe('Some values are not valid.');
    expect(en.body.error.fields).toEqual({ locale: 'Invalid value', extra: 'Unknown field' });

    const unauthenticated = await call('GET', '/auth/me', {
      headers: { 'accept-language': 'en' },
    });
    expect(unauthenticated.body.error.message).toBe('Sign in to continue.');
  });
});

describe('organization default language', () => {
  it('org:create --locale sets the default the members get', async () => {
    const slug = `org-en-${crypto.randomUUID().slice(0, 8)}`;
    const { id } = await createOrganization({ slug, name: 'English Academy', locale: 'en' });
    const member = await createUser('mentor', { organizationId: id });
    const me = await call('GET', '/auth/me', { cookies: (await loginAs(member)).cookies });
    expect(me.body.locale).toBe('en');
    await expect(
      createOrganization({ slug: `${slug}-x`, name: 'Bad', locale: 'de' }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
