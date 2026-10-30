import { expect, type Page, test } from '@playwright/test';
import { expectPersianPage, isMobile } from './helpers';
import { E2E_PORT, readState } from './server/state';

/**
 * "Team" (admin): new mentor → (SEC-S7 password check) → one-time invite link → the mentor
 * opens it, sets a password, signs in and sees only their own students. 1440px and 375px.
 * The first POST /invitations is answered with `403 REAUTH_REQUIRED` by the test (a fresh
 * e2e session is always within the 30-minute window), so the real `POST /auth/reauth` and the
 * repeat of the same request are exercised end to end.
 */

const ORIGIN = `http://localhost:${E2E_PORT}`;
const SLOW = { timeout: 60_000 };
test.use({ navigationTimeout: 120_000 });

async function signIn(page: Page, phone: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('شماره‌ی موبایل').fill(phone);
  await page.getByLabel('رمز', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
  await page.waitForURL('**/today', SLOW);
}

test('admin invites a mentor (with password re-check); the mentor sees only own students', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  const desktop = !isMobile(page);
  const tag = `${desktop ? 'D' : 'M'}${Date.now().toString().slice(-6)}`;
  const mentorName = `رضا مشاور ${tag}`;
  const mentorPhone = `09${desktop ? '13' : '14'}${Date.now().toString().slice(-7)}`;
  const persianPhone = mentorPhone.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);

  await signIn(page, state.admin.phone, state.admin.password);

  // --- "Team" in the admin menu ----------------------------------------------------------
  if (desktop) {
    await page.getByRole('link', { name: 'تیم' }).click();
  } else {
    await page.goto('/team');
  }
  await page.waitForURL('**/team', SLOW);
  await expect(page.getByRole('heading', { level: 1, name: 'تیم' })).toBeVisible(SLOW);
  await expect(
    page.getByRole('list', { name: 'اعضای تیم' }).getByText(state.admin.displayName),
  ).toBeVisible();
  await expectPersianPage(page);

  // The first invitation answer asks for the password again (SEC-S7).
  let asked = false;
  await page.route('**/api/v1/invitations', async (route) => {
    if (!asked && route.request().method() === 'POST') {
      asked = true;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'REAUTH_REQUIRED', message: 'برای این کار اول رمزت را دوباره وارد کن.' },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole('button', { name: 'مربی جدید' }).click();
  const form = page.getByRole('dialog', { name: 'مربی جدید' });
  await expect(form).toBeVisible();
  await form.getByLabel('نام').fill(mentorName);
  await form.getByLabel('شماره‌ی موبایل').fill(persianPhone);
  await expectPersianPage(page);
  await form.getByRole('button', { name: 'ساخت لینک دعوت' }).click();

  const reauth = page.getByRole('dialog', { name: 'برای ادامه رمزت را دوباره وارد کن' });
  await expect(reauth).toBeVisible(SLOW);
  await reauth.getByLabel('رمز', { exact: true }).fill('not-my-password-123');
  await reauth.getByRole('button', { name: 'تأیید و ادامه' }).click();
  await expect(reauth.getByRole('alert')).toBeVisible(SLOW);
  await reauth.getByLabel('رمز', { exact: true }).fill(state.admin.password);
  await reauth.getByRole('button', { name: 'تأیید و ادامه' }).click();

  const ready = page.getByRole('dialog', { name: /لینک دعوت رضا مشاور/ });
  await expect(ready).toBeVisible(SLOW);
  await expect(ready.getByText('این لینک فقط همین یک بار نمایش داده می‌شود.')).toBeVisible();
  const inviteUrl = (await ready.getByTestId('invite-url').textContent()) ?? '';
  expect(inviteUrl).toMatch(/\/invite#t=[^?&]+$/);
  await expect(ready.getByText(/سلام رضا، این لینک ورود تو/)).toBeVisible();
  await expectPersianPage(page);
  await ready.getByRole('button', { name: 'تمام شد' }).click();
  await expect(ready).toBeHidden();
  const row = page.getByRole('listitem').filter({ hasText: mentorName });
  await expect(row.getByText('دعوت‌شده')).toBeVisible(SLOW);
  await expect(page.getByTestId('invite-url')).toHaveCount(0);

  // --- the mentor accepts the invite and signs in ---------------------------------------
  const context = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    isMobile: !desktop,
    hasTouch: !desktop,
  });
  const mp = await context.newPage();
  await mp.goto(inviteUrl);
  await mp.getByLabel('شماره‌ی موبایلت').fill(mentorPhone);
  await mp.getByLabel('رمز', { exact: true }).fill('mentor-pass-e2e-4821');
  await mp.getByLabel('تکرار رمز', { exact: true }).fill('mentor-pass-e2e-4821');
  await mp.getByRole('button', { name: 'ثبت رمز و ورود' }).click();
  await mp.waitForURL('**/today', { timeout: 120_000 });
  await expectPersianPage(mp);
  // --- two students (a mentor must be active to get one): one for them, one not ----------
  const users = (await (await page.request.get('/api/v1/users?role=mentor')).json()) as {
    items: Array<{ id: string; displayName: string }>;
  };
  const mentorId = users.items.find((u) => u.displayName === mentorName)?.id;
  expect(mentorId).toBeTruthy();
  const mine = `هنرجوی رضا ${tag}`;
  const other = `هنرجوی دیگر ${tag}`;
  for (const [name, mentor, n] of [
    [mine, mentorId, '1'],
    [other, null, '2'],
  ] as const) {
    const res = await page.request.post('/api/v1/students', {
      data: {
        displayName: name,
        phone: `09${desktop ? '11' : '12'}${n}${Date.now().toString().slice(-6)}`,
        ...(mentor ? { mentorId: mentor } : {}),
      },
      headers: { Origin: ORIGIN },
    });
    expect(res.status(), await res.text()).toBe(201);
  }

  // No admin items for a mentor.
  await expect(mp.getByRole('link', { name: 'تیم' })).toHaveCount(0);
  await mp.goto('/students');
  await expect(mp.getByRole('link', { name: mine })).toBeVisible(SLOW);
  await expect(mp.getByText(other)).toHaveCount(0);
  await expectPersianPage(mp);
  const team = await mp.goto('/team');
  expect(new URL(mp.url()).pathname).not.toBe('/team');
  expect(team?.status() ?? 200).toBeLessThan(500);
  await context.close();

  // --- back in "Team": active, with the accepted date and 1 student ------------------------
  await page.goto('/team');
  const active = page.getByRole('listitem').filter({ hasText: mentorName });
  await expect(active.getByText('فعال', { exact: true })).toBeVisible(SLOW);
  await expect(active.getByText(/دعوت پذیرفته شد:/)).toBeVisible();
  await expect(active.getByText('۱ هنرجو')).toBeVisible();

  // --- disable with the in-page confirmation, then enable again ---------------------------
  await active.getByRole('button', { name: `غیرفعال کردن ${mentorName}` }).click();
  await active.getByRole('button', { name: 'بله، غیرفعال کن' }).click();
  await expect(active.getByText('غیرفعال', { exact: true })).toBeVisible(SLOW);
  await active.getByRole('button', { name: `فعال کردن دوباره‌ی ${mentorName}` }).click();
  await active.getByRole('button', { name: 'بله، فعال کن' }).click();
  await expect(active.getByText('فعال', { exact: true })).toBeVisible(SLOW);
  await expectPersianPage(page);
});
