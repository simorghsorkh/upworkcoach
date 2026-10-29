import { expect, type Page, test } from '@playwright/test';
import { expectPersianPage, isMobile } from './helpers';
import { readState } from './server/state';

/**
 * Sprint 2 main flow against the real backend (throwaway database, tests/e2e/server/start.ts):
 * admin creates a student → invite link → record → adds a showcase → changes the stage →
 * sees the student in the kanban; then the student accepts the invite and sees the path and
 * the showcase. 1440px and 375px, no horizontal page overflow at every step.
 */

async function signIn(page: Page, phone: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('شماره‌ی موبایل').fill(phone);
  await page.getByLabel('رمز', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
  await page.waitForURL('**/today', { timeout: 30_000 });
}

/** The visible one of several same-named buttons (header on desktop, action bar on mobile). */
/** After a write: the dev server compiles each API route on its first request. */
const AFTER_WRITE = { timeout: 30_000 };

function visibleButton(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
}

test('admin: new student → invite → record → showcase → stage → kanban; student sees path', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found (server started outside tests/e2e/server)');
  if (!state) return;

  const desktop = !isMobile(page);
  const tag = `${desktop ? 'D' : 'M'}${Date.now().toString().slice(-6)}`;
  const name = `کیمیا آزمون ${tag}`;
  const phone = `09${desktop ? '13' : '14'}${Date.now().toString().slice(-7)}`;

  await signIn(page, state.admin.phone, state.admin.password);

  // --- M2: list + new student ---------------------------------------------------------
  await page.goto('/students');
  await expect(page.getByRole('heading', { level: 1, name: /هنرجوها/ })).toBeVisible();
  await expectPersianPage(page);
  // Sprint 3: CSV import (dry run first) and export are real for the admin.
  if (desktop) {
    await page.getByRole('button', { name: 'ورود از اکسل' }).click();
    const imp = page.getByRole('dialog', { name: 'ورود هنرجوها از فایل' });
    await expect(imp.getByRole('button', { name: 'ثبت' })).toHaveAttribute('aria-disabled', 'true');
    await imp.getByLabel('فایل CSV').setInputFiles({
      name: 'students.csv',
      mimeType: 'text/csv',
      // A header and one row without a mobile number: the dry run reports it.
      buffer: Buffer.from(['نام,موبایل', 'بی‌موبایل,', ''].join('\n'), 'utf8'),
    });
    await expect(imp.getByText('۱ با خطا')).toBeVisible({ timeout: 30_000 });
    await expect(imp.getByText('ردیف‌های دارای خطا')).toBeAttached();
    await imp.getByRole('button', { name: 'انصراف' }).click();
    await page.getByRole('button', { name: 'خروجی CSV' }).click();
    const exp = page.getByRole('dialog', { name: 'خروجی CSV' });
    await expect(exp.getByText(/موبایل و لینک پروفایل همه‌ی هنرجوهاست/)).toBeVisible();
    // A fetch button since SEC-S7 (re-auth before the export), not a bare link.
    await expect(exp.getByRole('button', { name: 'هنرجوها' })).toBeVisible();
    await exp.getByRole('button', { name: 'بستن' }).click();
  }

  await page.getByRole('button', { name: 'هنرجوی جدید' }).click();
  const dialog = page.getByRole('dialog', { name: 'هنرجوی جدید' });
  await expect(dialog).toBeVisible();
  await expectPersianPage(page);
  await dialog.getByLabel('نام و نام خانوادگی').fill(name);
  await dialog.getByLabel('موبایل').fill(phone.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d));
  await dialog.getByRole('button', { name: 'ساخت و گرفتن لینک دعوت' }).click();

  const ready = page.getByRole('dialog', { name: /پرونده‌ی کیمیا ساخته شد/ });
  await expect(ready).toBeVisible(AFTER_WRITE);
  const inviteUrl = (await ready.getByTestId('invite-url').textContent()) ?? '';
  // C1: the token travels only in the fragment.
  expect(inviteUrl).toMatch(/\/invite#t=[^?&]+$/);
  await expect(ready.getByText(/سلام کیمیا، این لینک ورود تو/)).toBeVisible();
  await expectPersianPage(page);
  await ready.getByRole('link', { name: 'رفتن به پرونده' }).click();

  // --- M3: record ---------------------------------------------------------------------
  await page.waitForURL(/\/students\/[0-9a-f-]{36}$/, AFTER_WRITE);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('هنوز وارد نشده').first()).toBeVisible();
  await expect(page.getByText(/پرونده .*٪ کامل/)).toBeVisible();
  // Sprint 4: health is computed and shown to staff only (the student check is further down).
  await expect(
    page.getByText(/^(روبه‌راه|نیاز به توجه|گیرکرده|گیرکرده · خطر ریزش)$/).first(),
  ).toBeVisible();
  await expectPersianPage(page);

  // --- showcase (rule 8: no password field, fixed warning) -----------------------------
  const profiles = page.locator('#profiles');
  await profiles.getByRole('button', { name: 'افزودن' }).click();
  const pd = page.getByRole('dialog', { name: /ویترین تازه برای کیمیا/ });
  await expect(pd).toBeVisible();
  await expect(pd.locator('input[type="password"]')).toHaveCount(0);
  await expect(pd.getByText(/رمز یا کد ورود هیچ حسابی را این‌جا ننویس/)).toBeVisible();
  await pd.getByLabel('پلتفرم').selectOption({ label: 'Upwork' });
  const url = pd.getByLabel(/لینک عمومی/);
  await url.fill('http://www.upwork.com/freelancers/~01e2e');
  await pd.getByRole('button', { name: 'افزودن ویترین' }).click();
  await expect(pd.getByText('آدرس کامل را با https بنویس.')).toBeVisible();
  await url.fill('https://www.upwork.com/freelancers/~01e2e');
  await pd.getByLabel(/تیتر/).fill('Shopify Speed Expert | Core Web Vitals');
  await pd.getByLabel('وضعیت').selectOption('active');
  await pd.getByLabel('مبلغ').fill('۲۵');
  await pd.getByLabel('واحد').selectOption('hour');
  await pd.getByLabel('ویترین اصلی').check();
  await expectPersianPage(page);
  await pd.getByRole('button', { name: 'افزودن ویترین' }).click();
  await expect(pd).toBeHidden(AFTER_WRITE);
  await expect(
    profiles.getByRole('link', { name: /upwork\.com\/freelancers\/~01e2e/ }),
  ).toBeVisible();
  await expect(profiles.getByText('Shopify Speed Expert | Core Web Vitals')).toBeVisible();
  // The header tile follows after the server refresh.
  await expect(page.getByText('۲۵ دلار/ساعت').first()).toBeVisible(AFTER_WRITE);
  await expectPersianPage(page);

  // --- stage change ---------------------------------------------------------------------
  await visibleButton(page, 'تغییر مرحله').click();
  const sd = page.getByRole('dialog', { name: /تغییر مرحله‌ی کیمیا/ });
  await expect(sd).toBeVisible();
  const nextStage = sd.getByRole('radio', { name: /۱ — انتخاب نیچ/ });
  await expect(nextStage).toBeChecked();
  await sd.getByLabel(/یادداشت/).fill('جلسه‌ی آشنایی انجام شد.');
  await expectPersianPage(page);
  await sd.getByRole('button', { name: 'ثبت مرحله‌ی ۱' }).click();
  await expect(page.getByText('کیمیا به مرحله‌ی ۱ رفت.')).toBeVisible(AFTER_WRITE);
  await expect(page.locator('#timeline').getByText('جلسه‌ی آشنایی انجام شد.')).toBeVisible(
    AFTER_WRITE,
  );

  // --- M4: kanban -----------------------------------------------------------------------
  await page.goto('/stages');
  await expect(page.getByRole('heading', { level: 1, name: 'مراحل مسیر' })).toBeVisible();
  const column = page.locator('section[aria-labelledby]').filter({
    has: page.getByRole('heading', { level: 2, name: 'انتخاب نیچ' }),
  });
  if (!desktop) {
    await page
      .getByRole('navigation', { name: 'پرش به مرحله' })
      .getByRole('link', { name: /انتخاب نیچ/ })
      .click();
  }
  const card = column.getByRole('link', { name });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  await expect(
    column.getByRole('button', { name: `انتقال ${name} به مرحله‌ی دیگر` }),
  ).toBeAttached();
  await expectPersianPage(page);

  // Kanban → list tab
  await page
    .getByRole('navigation', { name: 'نوع نما' })
    .getByRole('link', { name: 'فهرست' })
    .click();
  await page.waitForURL('**/students');
  await page.getByRole('searchbox', { name: 'جستجو', exact: true }).fill(tag);
  await expect(page.getByRole('link', { name })).toBeVisible();
  await expectPersianPage(page);

  // --- S1: the student accepts the invite and sees the path + own showcase ---------------
  const context = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    isMobile: !desktop,
    hasTouch: !desktop,
  });
  const sp = await context.newPage();
  await sp.goto(inviteUrl);
  await sp.getByLabel('شماره‌ی موبایلت').fill(phone);
  await sp.getByLabel('رمز', { exact: true }).fill('student-pass-1234');
  await sp.getByLabel('تکرار رمز', { exact: true }).fill('student-pass-1234');
  await sp.getByRole('button', { name: 'ثبت رمز و ورود' }).click();
  await sp.waitForURL('**/home', AFTER_WRITE);
  await expect(sp.getByRole('heading', { level: 1, name: 'سلام کیمیا' })).toBeVisible();
  await expect(sp.getByRole('heading', { level: 2, name: 'مسیر من' })).toBeVisible();
  await expect(sp.getByText('اینجایی')).toBeVisible();
  await expect(sp.locator('li[aria-current="step"]')).toContainText('انتخاب نیچ');
  // Students never see health or staff fields.
  await expect(sp.getByText('روبه‌راه', { exact: true })).toHaveCount(0);
  await expectPersianPage(sp);

  await sp.goto('/my/profile');
  await expect(sp.getByRole('heading', { level: 2, name: 'پروفایل‌های من' })).toBeVisible();
  await expect(sp.getByRole('link', { name: /upwork\.com\/freelancers\/~01e2e/ })).toBeVisible();
  await expectPersianPage(sp);
  await context.close();
});

test('admin settings: stages and platforms with client-side checks', async ({ page }) => {
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  await signIn(page, state.admin.phone, state.admin.password);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'تنظیمات' })).toBeVisible();
  await expect(page.getByText('انتخاب نیچ')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ویرایش Upwork' })).toBeVisible();
  await expectPersianPage(page);

  await page.getByRole('button', { name: 'مرحله‌ی تازه' }).click();
  const dialog = page.getByRole('dialog', { name: 'مرحله‌ی تازه' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'افزودن لینک' }).click();
  await dialog.getByLabel('آدرس لینک ۱').fill('http://insecure.example');
  await dialog.getByRole('button', { name: 'افزودن مرحله' }).click();
  await expect(dialog.getByText('برچسب مرحله را وارد کن (مثلاً ۳).')).toBeVisible();
  await expect(dialog.getByText('آدرس کامل را با https بنویس.')).toBeVisible();
  await expectPersianPage(page);
});
