import { type Browser, expect, type Page, test } from '@playwright/test';
import { expectPersianPage, isMobile } from './helpers';
import { E2E_PORT, readState } from './server/state';

/**
 * Sprint 4 flows against the real backend (throwaway database), at 1440px and 375px:
 *  1. a red manual flag → the student shows up in "Today" and the students list with the
 *     plain reason and the rule code; the student never sees any health anywhere;
 *  2. the student asks → the mentor answers from "Today" → the student sees "New answer";
 *  3. a check-in with "I need help" opens a question in the queue.
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

function visibleButton(page: Page, name: string | RegExp) {
  return page
    .getByRole('button', { name, exact: typeof name === 'string' })
    .filter({ visible: true })
    .first();
}

async function createStudent(page: Page, tag: string, prefix: string) {
  const name = `${prefix} آزمون ${tag}`;
  const phone = `09${isMobile(page) ? '18' : '17'}${Date.now().toString().slice(-7)}`;
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
  // The first visit compiles the student pages in `next dev`: allow more time.
  await sp.waitForURL('**/home', { timeout: 120_000 });
  return { sp, context };
}

const tagOf = (page: Page) => `${isMobile(page) ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;

/** Words and codes of the staff-only health UI; none may reach a student page. */
const HEALTH_WORDS =
  /گیرکرده|نیاز به توجه|روبه‌راه|خطر ریزش|توپ:|توپ در زمین|پرچم|هشدار خاموش|R-(INACT|STALL|OVERDUE|LOOP|NOTASK|EXTEND|FLAG|CHECKIN|MOOD)/;

test('red flag → «امروز» and the list show the reason; the student never sees health', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  const tag = tagOf(page);
  await signIn(page, state.admin.phone, state.admin.password);
  const st = await createStudent(page, tag, 'سپیده');
  const { sp, context } = await studentPage(browser, page, st.inviteUrl, st.phone);

  // --- record: "More" → "Manual flag" (red, financial) --------------------------------
  await page.goto(`/students/${st.id}`);
  await expect(page.getByRole('heading', { level: 1, name: st.name })).toBeVisible(SLOW);
  await visibleButton(page, 'بیشتر').click();
  await page.getByRole('button', { name: /پرچم دستی/ }).click();
  const fd = page.getByRole('dialog', { name: /پرچم دستی برای سپیده/ });
  await expect(fd).toBeVisible();
  await fd.getByText('مالی', { exact: true }).click();
  await fd.getByText('قرمز · گیرکرده').click();
  await fd.getByLabel(/یادداشت/).fill('فعلاً پول Connects ندارد');
  await expectPersianPage(page);
  await fd.getByRole('button', { name: 'ثبت پرچم' }).click();
  await expect(fd).toBeHidden(SLOW);
  // Header: red badge, plain reason with its code, the flag card.
  const reasons = page.getByRole('list', { name: 'دلیل وضعیت' });
  await expect(reasons.getByText('پرچم دستی: مالی')).toBeVisible(SLOW);
  await expect(reasons.getByText('R-FLAG')).toBeVisible();
  await expect(page.getByText('گیرکرده', { exact: true }).first()).toBeVisible();
  await expect(page.locator('#flags').getByText('فعلاً پول Connects ندارد')).toBeVisible();
  await expectPersianPage(page);

  // --- "Today": stuck row with reason, code and "Ball" ---------------------------------
  await page.goto('/today');
  const stuck = page.locator('#stuck');
  const row = stuck.locator('li').filter({ hasText: st.name });
  await expect(row).toBeVisible(SLOW);
  await expect(row.getByText(/پرچم دستی: مالی/)).toBeVisible();
  await expect(row.getByText('R-FLAG')).toBeVisible();
  await expect(row.getByText('گیرکرده', { exact: true })).toBeVisible();
  await expectPersianPage(page);

  // --- students list: health chip "Stuck" + reason ------------------------------------
  await page.goto('/students?health=red');
  const listRow = page.locator('tr').filter({ hasText: st.name });
  await expect(listRow).toBeVisible(SLOW);
  await expect(listRow.getByText(/پرچم دستی: مالی/)).toBeVisible();
  if (!isMobile(page)) {
    // Desktop chip row; on mobile the same filter lives in the "Filter" sheet.
    await expect(
      page.getByRole('navigation', { name: 'سلامت' }).getByRole('link', { name: /گیرکرده/ }),
    ).toHaveAttribute('aria-current', 'true');
  }
  await expectPersianPage(page);

  // --- the student never sees health, flags or rule codes ------------------------------
  for (const path of [
    '/home',
    '/my/tasks',
    '/my/questions',
    '/my/path',
    '/my/profile',
    '/my/checkin',
  ]) {
    await sp.goto(path);
    await expect(sp.locator('main')).toBeVisible(SLOW);
    const text = (await sp.locator('body').innerText()) ?? '';
    expect(text, `health leaked on ${path}`).not.toMatch(HEALTH_WORDS);
    expect(text).not.toContain('فعلاً پول Connects ندارد');
  }
  await expectPersianPage(sp);
  const me = await sp.request.get('/api/v1/me/student');
  expect(me.status()).toBe(200);
  const raw = await me.text();
  expect(raw).not.toMatch(/"health"|"flags"|churnRisk|R-FLAG/);
  await context.close();
});

test('question: student asks → mentor answers from «امروز» → student sees the reply', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  const tag = tagOf(page);
  const subject = `نرخ اولیه ${tag}`;
  const answer = `جواب کوتاه: ۱۵ دلار برای شروع خوب است ${tag}`;
  await signIn(page, state.admin.phone, state.admin.password);
  const st = await createStudent(page, tag, 'مهدی');
  const { sp, context } = await studentPage(browser, page, st.inviteUrl, st.phone);

  // --- student asks -----------------------------------------------------------------------
  await sp.goto('/my/questions');
  await expect(sp.getByText('هنوز سؤالی نپرسیده‌ای')).toBeVisible(SLOW);
  await sp.getByRole('link', { name: 'سؤال جدید' }).first().click();
  await sp.waitForURL('**/my/questions/new', SLOW);
  await expect(sp.getByText(/جواب می‌گیری\./)).toBeVisible();
  await sp.getByLabel('موضوع').fill(subject);
  await sp.getByLabel('سؤالت').fill('۱۵ دلار برای شروع کم نیست؟ Is $15/hr too low?');
  await expectPersianPage(sp);
  await sp.getByRole('button', { name: 'فرستادن سؤال' }).click();
  await sp.waitForURL(/\/my\/questions\/[0-9a-f-]{36}\?sent=1$/, SLOW);
  await expect(sp.getByText('سؤالت فرستاده شد.')).toBeVisible();
  await expect(sp.getByText('منتظر پاسخ')).toBeVisible();

  // --- mentor: "Today" → "Answer" -----------------------------------------------------------
  await page.goto('/today');
  const q = page.locator('#questions');
  await expect(q.getByRole('link', { name: subject, exact: true })).toBeVisible(SLOW);
  await expectPersianPage(page);
  await q.getByRole('link', { name: `پاسخ به سؤال ${subject} از ${st.name}` }).click();
  await page.waitForURL(/\/questions\/[0-9a-f-]{36}$/, SLOW);
  await expect(page.getByText('Is $15/hr too low?', { exact: false })).toBeVisible();
  // Record summary next to the question.
  await expect(page.locator('#summary').getByRole('heading', { name: st.name })).toBeVisible();
  await page.getByLabel('پاسخ', { exact: true }).fill(answer);
  await expectPersianPage(page);
  await page.getByRole('button', { name: 'ثبت پاسخ' }).click();
  await expect(page.getByText(answer)).toBeVisible(SLOW);
  await expect(page.getByText('پاسخ‌داده', { exact: true }).first()).toBeVisible(SLOW);

  // --- student sees "New answer" at home, then the answer ---------------------------------
  await sp.goto('/home');
  const home = sp
    .locator('section')
    .filter({ has: sp.getByRole('heading', { name: /سؤال‌های من/ }) });
  await expect(home.getByText('پاسخ جدید', { exact: true })).toBeVisible(SLOW);
  await expectPersianPage(sp);
  await home.getByRole('link', { name: subject, exact: true }).click();
  await sp.waitForURL(/\/my\/questions\/[0-9a-f-]{36}$/, SLOW);
  await expect(sp.getByText(answer)).toBeVisible();
  await sp.getByRole('button', { name: 'ممنون، حل شد' }).click();
  await expect(sp.getByRole('heading', { name: 'سؤال بسته شده' })).toBeVisible(SLOW);
  await expectPersianPage(sp);
  await context.close();
});

test('check-in with «به کمک نیاز دارم» opens a question in the mentor queue', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  const tag = tagOf(page);
  const blocker = `بین دو نیچ مانده‌ام ${tag}`;
  await signIn(page, state.admin.phone, state.admin.password);
  const st = await createStudent(page, tag, 'نگار');
  const { sp, context } = await studentPage(browser, page, st.inviteUrl, st.phone);

  await sp.goto('/my/checkin');
  await expect(sp.getByRole('heading', { level: 1, name: /check-in این هفته/ })).toBeVisible(SLOW);
  await sp.getByRole('radio', { name: '۲ از ۵، بد' }).check({ force: true });
  await sp.getByText('بله، کمک لازم دارم').click();
  await sp.getByLabel(/بزرگ‌ترین مانع/).fill(blocker);
  await sp.getByLabel(/هفته‌ی بعد چه می‌کنی/).fill('سه شاهد تقاضا');
  await expectPersianPage(sp);
  await sp.getByRole('button', { name: /ثبت check-in/ }).click();
  await expect(sp.getByText('ثبت شد.')).toBeVisible(SLOW);
  await sp.getByRole('link', { name: 'دیدن سؤال' }).click();
  await sp.waitForURL(/\/my\/questions\/[0-9a-f-]{36}$/, SLOW);
  await expect(sp.getByText(blocker).first()).toBeVisible();
  // The week is done: the page now shows what was sent.
  await sp.goto('/my/checkin');
  await expect(sp.getByText('check-in این هفته را فرستاده‌ای.')).toBeVisible(SLOW);

  // --- staff: queue row "From check-in", the record shows the check-in -------------------
  await page.goto('/questions');
  const row = page.locator('li').filter({ hasText: st.name });
  await expect(row).toBeVisible(SLOW);
  await expect(row.getByText(/از/).first()).toBeVisible();
  await expect(row.locator('bdi', { hasText: /^check-in$/ }).first()).toBeVisible();
  await expectPersianPage(page);
  await page.goto(`/students/${st.id}`);
  const ci = page.locator('#checkins');
  await expect(ci.getByText(/حال ۲ از ۵/)).toBeVisible(SLOW);
  await expect(ci.getByText(blocker)).toBeVisible();
  await expect(ci.getByText('کمک خواست')).toBeVisible();
  await expectPersianPage(page);
  await context.close();
});
