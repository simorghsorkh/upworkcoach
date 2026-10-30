import { type Browser, expect, type Page, test } from '@playwright/test';
import { expectPersianPage, isMobile } from './helpers';
import { E2E_PORT, readState } from './server/state';

/**
 * Sprint 3 flows against the real backend (throwaway database), at 1440px and 375px:
 *  1. mentor creates a «proposal review» task → student submits → mentor requests changes →
 *     student submits again → mentor accepts;
 *  2. an internal note never reaches the student; a shared one does.
 */

const ORIGIN = `http://localhost:${E2E_PORT}`;
const SLOW = { timeout: 30_000 };

async function signIn(page: Page, phone: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('شماره‌ی موبایل').fill(phone);
  await page.getByLabel('رمز', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
  await page.waitForURL('**/today', SLOW);
}

function visibleButton(page: Page, name: string | RegExp) {
  return page
    .getByRole('button', { name, exact: typeof name === 'string' })
    .filter({ visible: true })
    .first();
}

/** A fresh student through the API (the UI path is covered by students-flow.spec.ts). */
async function createStudent(page: Page, tag: string) {
  const name = `نیما آزمون ${tag}`;
  const phone = `09${isMobile(page) ? '16' : '15'}${Date.now().toString().slice(-7)}`;
  const res = await page.request.post('/api/v1/students', {
    data: { displayName: name, phone },
    headers: { Origin: ORIGIN },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as { student: { id: string }; inviteUrl: string };
  return { id: body.student.id, name, phone, inviteUrl: body.inviteUrl };
}

async function studentPage(browser: Browser, page: Page, inviteUrl: string, phone: string) {
  const desktop = !isMobile(page);
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
  await sp.waitForURL('**/home', SLOW);
  return { sp, context };
}

test('task: create → submit → changes requested → resubmit → accepted', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  const tag = `${isMobile(page) ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  const title = `پروپوزال برای بررسی ${tag}`;

  await signIn(page, state.admin.phone, state.admin.password);
  const st = await createStudent(page, tag);
  const { sp, context } = await studentPage(browser, page, st.inviteUrl, st.phone);

  // --- mentor: new task from the record ---------------------------------------------------
  await page.goto(`/students/${st.id}`);
  await expect(page.getByRole('heading', { level: 1, name: st.name })).toBeVisible(SLOW);
  await expect(page.locator('#tasks').getByText('کار بازی ندارد')).toBeVisible();
  await visibleButton(page, 'کار').click();
  const td = page.getByRole('dialog', { name: `کار برای ${st.name}` });
  await expect(td).toBeVisible();
  await td.getByLabel('عنوان').fill(title);
  await td
    .getByLabel(/شرح و معیار پذیرش/)
    .fill('یک جاب واقعی انتخاب کن.\nوقتی قبول است که: دو خط اول درباره‌ی کارفرماست.');
  await td.getByText('پروپوزال برای بررسی', { exact: true }).click();
  await expect(td.getByText(/متن آگهی و متن پروپوزال را جدا می‌فرستد/)).toBeVisible();
  // Jalali deadline: 1 week shortcut, the field shows a Persian date.
  await td.getByRole('button', { name: '۱ هفته' }).click();
  await expect(td.getByLabel('مهلت')).toHaveValue(/^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/);
  await expectPersianPage(page);
  await td.getByRole('button', { name: 'ثبت کار' }).click();
  await expect(td).toBeHidden(SLOW);
  const taskLink = page.locator('#tasks').getByRole('link', { name: title });
  await expect(taskLink).toBeVisible(SLOW);
  await taskLink.click();
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/, SLOW);
  const taskUrl = new URL(page.url()).pathname;
  const taskId = taskUrl.split('/').pop() ?? '';
  await expect(page.getByText(/هنوز تحویل نداده است/)).toBeVisible();
  await expectPersianPage(page);

  // --- student: sees it at home and submits v1 --------------------------------------------
  await sp.goto('/home');
  // exact: the welcome card's first step links to the same task with a longer name.
  const homeTask = sp.getByRole('link', { name: title, exact: true });
  await expect(homeTask).toBeVisible(SLOW);
  await expectPersianPage(sp);
  await homeTask.click();
  await sp.waitForURL(`**/my/tasks/${taskId}`, SLOW);
  await expect(sp.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(sp.getByText('دو خط اول درباره‌ی کارفرماست.')).toBeVisible();
  const job = sp.getByLabel(/متن آگهی/);
  const proposal = sp.getByLabel(/متن پروپوزال/);
  await expect(job).toHaveAttribute('dir', 'ltr');
  await expect(proposal).toHaveAttribute('dir', 'ltr');
  // Consent is OFF by default (D6).
  const consent = sp.getByRole('checkbox', { name: /بدون نام من/ });
  await expect(consent).not.toBeChecked();
  await sp.getByLabel('پلتفرم').selectOption({ label: 'Upwork' });
  await job.fill('Shopify store speed optimization needed. Budget: $500 fixed.');
  await proposal.fill('Hi, I am a Shopify speed expert with 4 years of experience.');
  await expectPersianPage(sp);
  await sp.getByRole('button', { name: 'تحویل نسخه‌ی ۱' }).click();
  await expect(sp.getByText('تحویل شد.')).toBeVisible(SLOW);

  // --- mentor: "Today" → review → changes requested -----------------------------------------
  await page.goto('/today');
  const reviews = page.locator('#reviews');
  await expect(reviews.getByRole('link', { name: title, exact: true })).toBeVisible(SLOW);
  await expectPersianPage(page);
  await reviews.getByRole('link', { name: `بازبینی ${title} از ${st.name}` }).click();
  await page.waitForURL(`**${taskUrl}`, SLOW);
  await expect(
    page.getByText('Shopify store speed optimization needed', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('[lang="en"][dir="ltr"]').first()).toBeVisible();
  await expect(page.getByText('رضایت برای استفاده‌ی بی‌نام: نه')).toBeVisible();
  await page.getByRole('radio', { name: /نیاز به اصلاح/ }).check();
  await page
    .getByRole('textbox', { name: /بازخورد/ })
    .fill('حکم: اصلاح جزئی\nمهم‌ترین اصلاح: با مشکل کارفرما شروع کن.\nقدم بعدی: نسخه‌ی ۲');
  await expectPersianPage(page);
  await page.getByRole('button', { name: /ثبت بازبینی/ }).click();
  await page.waitForURL((url) => url.pathname !== taskUrl, SLOW);

  // --- student: feedback + v2 ---------------------------------------------------------------
  await sp.goto(`/my/tasks/${taskId}`);
  await expect(
    sp.getByRole('heading', { level: 2, name: `بازخورد ${state.admin.displayName}` }),
  ).toBeVisible(SLOW);
  await expect(sp.getByText('با مشکل کارفرما شروع کن.')).toBeVisible();
  await expect(sp.getByText(/نیاز به اصلاح/).first()).toBeVisible();
  // v2 starts from v1.
  await expect(sp.getByLabel(/متن پروپوزال/)).toHaveValue(/Shopify speed expert/);
  await sp
    .getByLabel(/متن پروپوزال/)
    .fill('Keeping your theme customizations intact is the hard part.');
  await expectPersianPage(sp);
  await sp.getByRole('button', { name: 'تحویل نسخه‌ی ۲' }).click();
  await expect(sp.getByText('تحویل شد.')).toBeVisible(SLOW);

  // --- mentor: accept v2 ------------------------------------------------------------------
  await page.goto(taskUrl);
  await expect(page.getByText('Keeping your theme customizations intact')).toBeVisible(SLOW);
  await expect(page.getByRole('navigation', { name: 'نسخه‌ها' })).toBeVisible();
  await page.getByRole('radio', { name: /پذیرفته/ }).check();
  await page
    .getByRole('textbox', { name: /بازخورد/ })
    .fill('حکم: پذیرفته\nنقطه‌ی قوت: شروع با مشکل کارفرما.');
  await page.getByRole('button', { name: /ثبت بازبینی/ }).click();
  await page.waitForURL((url) => url.pathname !== taskUrl, SLOW);
  await page.goto(taskUrl);
  await expect(page.getByText('پذیرفته').first()).toBeVisible(SLOW);
  await expect(page.getByRole('heading', { name: 'بازبینی شما' })).toHaveCount(0);

  // --- student: accepted ------------------------------------------------------------------
  await sp.goto(`/my/tasks/${taskId}`);
  await expect(sp.getByText('پذیرفته شد')).toBeVisible(SLOW);
  await expect(sp.getByRole('button', { name: /تحویل نسخه/ })).toHaveCount(0);
  await sp.goto('/my/tasks?show=done');
  await expect(sp.getByRole('link', { name: title })).toBeVisible(SLOW);
  await expectPersianPage(sp);
  await context.close();
});

test('notes: an internal note never reaches the student; a shared one does', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  const desktop = !isMobile(page);
  const tag = `${desktop ? 'D' : 'M'}${Date.now().toString().slice(-6)}`;
  const internal = `CANARY-internal-${tag} هنرجو نباید این را ببیند`;
  const shared = `خلاصه‌ی جلسه ${tag}: این هفته فقط روی شاهد تقاضا تمرکز کن.`;

  await signIn(page, state.admin.phone, state.admin.password);
  const st = await createStudent(page, tag);
  const { sp, context } = await studentPage(browser, page, st.inviteUrl, st.phone);
  const first = st.name.split(' ')[0] ?? '';

  await page.goto(`/students/${st.id}`);
  await expect(page.getByRole('heading', { level: 1, name: st.name })).toBeVisible(SLOW);
  // Timeline entries only (the inline composer lives in the same card).
  const timeline = page.locator('#timeline ol');

  if (desktop) {
    // Inline composer above the timeline: internal by default.
    const composer = page.getByRole('form', { name: 'یادداشت تازه' });
    await composer.getByLabel('متن یادداشت').fill(internal);
    await composer.getByRole('button', { name: 'ثبت یادداشت' }).click();
    await expect(timeline.getByText(internal)).toBeVisible(SLOW);
    await expect(composer.getByLabel('متن یادداشت')).toHaveValue('');
    await composer.getByLabel('متن یادداشت').fill(shared);
    await composer.getByText('اشتراکی', { exact: true }).click();
    await expect(composer.getByText('هنرجو این را می‌بیند')).toBeVisible();
    await expectPersianPage(page);
    await composer.getByRole('button', { name: 'ثبت یادداشت' }).click();
  } else {
    // Mobile: the action bar "Note" sheet, then the "+" of the bottom bar.
    await visibleButton(page, 'یادداشت').click();
    const nd = page.getByRole('dialog', { name: `یادداشت برای ${st.name}` });
    await nd.getByLabel('متن').fill(internal);
    await expectPersianPage(page);
    await nd.getByRole('button', { name: 'ثبت یادداشت' }).click();
    await expect(nd).toBeHidden(SLOW);
    await expect(timeline.getByText(internal)).toBeVisible(SLOW);

    await page.getByRole('button', { name: 'افزودن سریع' }).click();
    const quick = page.getByRole('dialog', { name: `افزودن برای ${st.name}` });
    await quick.getByRole('button', { name: /یادداشت/ }).click();
    const nd2 = page.getByRole('dialog', { name: `یادداشت برای ${st.name}` });
    await nd2.getByLabel('متن').fill(shared);
    await nd2.getByText(`اشتراکی — ${first} هم می‌بیند`).click();
    await expect(nd2.getByText(/هنرجو این را می‌بیند/)).toBeVisible();
    await nd2.getByRole('button', { name: 'ثبت یادداشت' }).click();
    await expect(nd2).toBeHidden(SLOW);
  }
  await expect(timeline.getByText(shared)).toBeVisible(SLOW);
  await expect(timeline.getByText('داخلی — هنرجو نمی‌بیند').first()).toBeVisible();
  await expect(timeline.getByText('اشتراکی — هنرجو می‌بیند').first()).toBeVisible();
  await expectPersianPage(page);

  // --- student ---------------------------------------------------------------------------
  await sp.goto('/home');
  await expect(sp.getByRole('heading', { name: 'از مشاورت' })).toBeVisible(SLOW);
  await expect(sp.getByText(shared)).toBeVisible();
  await expect(sp.getByText(internal)).toHaveCount(0);
  expect(await sp.content()).not.toContain(`CANARY-internal-${tag}`);
  for (const path of ['/my/tasks', '/my/path', '/my/profile']) {
    await sp.goto(path);
    expect(await sp.content()).not.toContain(`CANARY-internal-${tag}`);
  }
  const api = await sp.request.get('/api/v1/me/shared-notes');
  expect(api.status()).toBe(200);
  const json = await api.text();
  expect(json).toContain(tag);
  expect(json).not.toContain(`CANARY-internal-${tag}`);
  await expectPersianPage(sp);
  await context.close();
});
