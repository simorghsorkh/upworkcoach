import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test';
import { expectPersianPage, isMobile } from './helpers';
import { E2E_PORT, readState } from './server/state';

/**
 * Coach Office sprint 7 (ADR-0014): a mentor opens bookings for a one-on-one program and sets
 * weekly hours; the mentee picks the mentor, a free time on the calendar and sends a request;
 * the mentor approves it on «تقویم» and the session shows in the mentee's programs.
 */

const ORIGIN = `http://localhost:${E2E_PORT}`;
const SLOW = { timeout: 60_000 };
const H = { headers: { Origin: ORIGIN } };
/** Local-only password for the people this spec creates in the throwaway database. */
const PASSWORD = 'booking-pass-1234';

test.use({ navigationTimeout: 120_000 });

type Json = Record<string, unknown> & { id: string };

async function call<T = Json>(
  r: APIRequestContext,
  method: 'post' | 'put',
  url: string,
  data: unknown,
  status: number,
): Promise<T> {
  const res = await r[method](`/api/v1${url}`, { data, ...H });
  expect(res.status(), await res.text()).toBe(status);
  return (await res.json()) as T;
}

async function signIn(page: Page, phone: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('شماره‌ی موبایل').fill(phone);
  await page.getByLabel('رمز', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
  await page.waitForURL('**/today', SLOW);
}

/** Accepts an invite link in a fresh browser context: the person is signed in there. */
async function acceptInvite(browser: Browser, page: Page, inviteUrl: string, phone: string) {
  const desktop = !isMobile(page);
  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport: page.viewportSize() ?? undefined,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    isMobile: !desktop,
    hasTouch: !desktop,
  });
  const token = new URL(inviteUrl).hash.replace(/^#t=/, '');
  await call(
    context.request,
    'post',
    '/auth/tokens/accept',
    { token, phone, password: PASSWORD },
    200,
  );
  return { context, page: await context.newPage() };
}

const phoneOf = (prefix: string) => `09${prefix}${Date.now().toString().slice(-7)}`;

test('a mentee books a session from the mentor calendar; the mentor approves it', async ({
  page,
  browser,
}) => {
  test.setTimeout(420_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  const mobile = isMobile(page);
  const tag = `${mobile ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;

  // --- Setup through the API: a mentor, a mentee, a one-on-one package with that mentor ---
  await signIn(page, state.admin.phone, state.admin.password);
  const admin = page.request;
  const mentorName = `مشاور تقویم ${tag}`;
  const mentorPhone = phoneOf(mobile ? '19' : '17');
  const invited = await call<{ userId: string; inviteUrl: string }>(
    admin,
    'post',
    '/invitations',
    { role: 'mentor', displayName: mentorName, phone: mentorPhone },
    201,
  );
  const mentor = await acceptInvite(browser, page, invited.inviteUrl, mentorPhone);
  const menteeName = `هنرجوی رزرو ${tag}`;
  const menteePhone = phoneOf(mobile ? '20' : '18');
  const st = await call<{ student: { id: string }; inviteUrl: string }>(
    admin,
    'post',
    '/students',
    { displayName: menteeName, phone: menteePhone },
    201,
  );
  const mentee = await acceptInvite(browser, page, st.inviteUrl, menteePhone);

  const title = `مشاوره‌ی تک‌به‌تک ${tag}`;
  const tpl = await call(
    admin,
    'post',
    '/program-templates',
    { kind: 'one_on_one', title, sessionQuota: 4, sessionMinutes: 60, validityDays: 60 },
    201,
  );
  await call(
    admin,
    'post',
    `/program-templates/${tpl.id}/nodes`,
    { nodeType: 'phase', title: 'جلسه‌ها' },
    201,
  );
  await call(admin, 'post', `/program-templates/${tpl.id}/publish`, {}, 200);
  const run = await call(
    admin,
    'post',
    '/program-runs',
    { templateId: tpl.id, mode: 'individual', title: `بسته‌ی ${tag}` },
    201,
  );
  await call(
    admin,
    'post',
    `/program-runs/${run.id}/staff`,
    { userId: invited.userId, role: 'mentor' },
    200,
  );
  await call(
    admin,
    'post',
    `/program-runs/${run.id}/enrollments`,
    { studentIds: [st.student.id] },
    200,
  );

  // --- The mentor opens bookings on «تقویم» and sets weekly hours ---------------------------
  await mentor.page.goto('/calendar');
  await expect(mentor.page.getByRole('heading', { level: 1, name: 'تقویم من' })).toBeVisible(SLOW);
  const offeringRow = mentor.page.getByRole('listitem').filter({ hasText: title });
  await offeringRow.getByLabel('رزرو می‌پذیرم').check();
  await expect(mentor.page.getByText(`تنظیمات «${title}» ذخیره شد.`)).toBeVisible(SLOW);
  await call(
    mentor.context.request,
    'put',
    `/mentors/${invited.userId}/availability`,
    {
      rules: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].map((weekday) => ({
        weekday,
        start: '08:00',
        end: '24:00',
      })),
      dates: [],
    },
    200,
  );
  await mentor.page.reload();
  await expect(mentor.page.getByRole('heading', { name: 'پیش‌نمایش برای هنرجو' })).toBeVisible(SLOW);
  await expect(mentor.page.getByRole('group', { name: 'روزها' })).toBeVisible(SLOW);
  await expectPersianPage(mentor.page);

  // --- The mentee picks the mentor, a free time and sends the request ----------------------
  await mentee.page.goto('/my/programs');
  await mentee.page.getByRole('link', { name: 'رزرو جلسه با مشاور' }).click();
  await mentee.page.waitForURL('**/my/mentors', SLOW);
  const card = mentee.page.getByRole('listitem').filter({ hasText: mentorName });
  await expect(card.getByText(title)).toBeVisible(SLOW);
  await expectPersianPage(mentee.page);
  await card.getByRole('link', { name: 'دیدن تقویم' }).click();
  await mentee.page.waitForURL(`**/my/mentors/${invited.userId}`, SLOW);
  await expect(mentee.page.getByText('از بسته‌ی تو ۴ جلسه قابل رزرو است.')).toBeVisible(SLOW);
  const firstTime = mentee.page.locator('li > button[aria-pressed]').first();
  await firstTime.click();
  await expect(firstTime).toHaveAttribute('aria-pressed', 'true');
  await mentee.page.getByLabel(/یادداشت برای مشاور/).fill(`درباره‌ی پروپوزال ${tag}`);
  await expectPersianPage(mentee.page);
  await mentee.page.getByRole('button', { name: 'ارسال درخواست' }).click();
  await mentee.page.waitForURL('**/my/mentors', SLOW);
  const myRequests = mentee.page.getByRole('region', { name: 'درخواست‌های جلسه‌ی من' });
  await expect(myRequests.getByText('در انتظار تأیید')).toBeVisible(SLOW);

  // --- The mentor approves it on «تقویم» ------------------------------------------------------
  await mentor.page.goto('/calendar');
  const requests = mentor.page.getByRole('region', { name: 'درخواست‌های در انتظار' });
  await expect(requests.getByText(`درباره‌ی پروپوزال ${tag}`)).toBeVisible(SLOW);
  await expect(requests.getByText(menteeName, { exact: false })).toBeVisible();
  await requests.getByRole('button', { name: 'تأیید' }).click();
  await expect(requests.getByText('تأییدشده')).toBeVisible(SLOW);

  // --- The mentee sees the booked session and the notice --------------------------------------
  await mentee.page.goto('/my/programs');
  await expect(mentee.page.getByRole('region', { name: /جلسه/ }).first()).toBeVisible(SLOW);
  await mentee.page.goto('/my/notifications');
  await expect(mentee.page.getByText(/جلسه‌ات تأیید شد/)).toBeVisible(SLOW);

  await mentor.context.close();
  await mentee.context.close();
});
