import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { expectPersianPage, isMobile } from './helpers';
import { E2E_PORT, readState } from './server/state';

/**
 * Coach Office acceptance scenario (docs/08-saas-evolution/prd-coach-office.md section 6), against
 * the real backend in the throwaway database. The setup goes through the API the screens use;
 * what each person sees is checked on the real pages:
 *   1–3  the organization (made by the e2e server), invited mentors, a CSV import into a course;
 *   4–6  a mentor's template approved by the admin, a group run with two mentors, a solo run;
 *   7    a one-on-one package: a held session, a next action and the package use;
 *   8–9  submit → review; the mentee sees the result, the progress and the notifications;
 *   10   the mentor's «امروز»: pending reviews and upcoming sessions;
 *   11   the admin overview, without the mentor's private note;
 *   12   the owner of a second organization sees none of it;
 *   13   main pages in English: `dir=ltr`, no horizontal overflow (both sizes).
 */

const ORIGIN = `http://localhost:${E2E_PORT}`;
const SLOW = { timeout: 60_000 };
const H = { headers: { Origin: ORIGIN } };
/** Local-only password for the people this spec creates in the throwaway database. */
const PASSWORD = 'scenario-pass-1234';

test.use({ navigationTimeout: 120_000 });

type Json = Record<string, unknown> & { id: string };

async function ok<T = Json>(res: Awaited<ReturnType<APIRequestContext['get']>>, status = 200) {
  expect(res.status(), await res.text()).toBe(status);
  return (await res.json()) as T;
}

const post = async <T = Json>(r: APIRequestContext, url: string, data: unknown, status = 201) =>
  ok<T>(await r.post(`/api/v1${url}`, { data, ...H }), status);

const patch = async <T = Json>(r: APIRequestContext, url: string, data: unknown) =>
  ok<T>(await r.patch(`/api/v1${url}`, { data, ...H }));

const get = async <T = Json>(r: APIRequestContext, url: string) =>
  ok<T>(await r.get(`/api/v1${url}`));

async function signIn(page: Page, phone: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('شماره‌ی موبایل').fill(phone);
  await page.getByLabel('رمز', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
  await page.waitForURL('**/today', SLOW);
}

async function newContext(browser: Browser, page: Page): Promise<BrowserContext> {
  const desktop = !isMobile(page);
  return browser.newContext({
    baseURL: ORIGIN,
    viewport: page.viewportSize() ?? undefined,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    isMobile: !desktop,
    hasTouch: !desktop,
  });
}

/** Accepts an invite link in a fresh browser context: the person is signed in there. */
async function acceptInvite(browser: Browser, page: Page, inviteUrl: string, phone: string) {
  const context = await newContext(browser, page);
  const token = new URL(inviteUrl).hash.replace(/^#t=/, '');
  await post(context.request, '/auth/tokens/accept', { token, phone, password: PASSWORD }, 200);
  return { context, page: await context.newPage() };
}

const phoneOf = (prefix: string, n: number) =>
  `09${prefix}${(Date.now() + n).toString().slice(-7)}`;

/** No horizontal page scroll, in either direction. */
async function expectNoOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(size.scroll, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(size.client);
}

async function expectEnglishPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('h1').first()).toBeVisible(SLOW);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expectNoOverflow(page);
}

test('Coach Office acceptance scenario, steps 1–12', async ({ page, browser }) => {
  test.skip(isMobile(page), 'one walk through the scenario is enough; step 13 runs at both sizes');
  test.setTimeout(480_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  const tag = Date.now().toString().slice(-6);
  const contexts: BrowserContext[] = [];

  // --- 1–2. The organization's owner invites two mentors ----------------------------------
  await signIn(page, state.admin.phone, state.admin.password);
  const admin = page.request;
  const mentors: Array<{ id: string; name: string; api: APIRequestContext; page: Page }> = [];
  for (const [i, first] of ['نیلوفر', 'کاوه'].entries()) {
    const name = `${first} مشاور ${tag}`;
    const phone = phoneOf('16', i);
    const invited = await post<{ userId: string; inviteUrl: string }>(admin, '/invitations', {
      role: 'mentor',
      displayName: name,
      phone,
    });
    const signed = await acceptInvite(browser, page, invited.inviteUrl, phone);
    contexts.push(signed.context);
    mentors.push({ id: invited.userId, name, api: signed.context.request, page: signed.page });
  }
  const [m1, m2] = mentors as [(typeof mentors)[number], (typeof mentors)[number]];

  // --- 4. A mentor builds a template and sends it for organization use; the admin approves --
  const courseTitle = `منتورینگ فریلنسری ۸ هفته‌ای ${tag}`;
  const tpl = await post(m1.api, '/program-templates', { kind: 'program', title: courseTitle });
  const addNode = (body: Record<string, unknown>) =>
    post(m1.api, `/program-templates/${tpl.id}/nodes`, body);
  await addNode({ nodeType: 'phase', title: 'شناخت بازار', expectedDays: 14 });
  await addNode({ nodeType: 'phase', title: 'پروفایل و پروپوزال' });
  const tree = await get<{ phases: Array<{ id: string; title: string }> }>(
    m1.api,
    `/program-templates/${tpl.id}`,
  );
  const phaseOne = tree.phases.find((n) => n.title === 'شناخت بازار');
  await addNode({
    parentId: phaseOne?.id,
    nodeType: 'assignment',
    title: `انتخاب نیچ ${tag}`,
    dueOffsetDays: 7,
    submissionType: 'text',
  });
  await post(m1.api, `/program-templates/${tpl.id}/publish`, {}, 200);
  const submitted = await post<{ visibility: string }>(
    m1.api,
    `/program-templates/${tpl.id}/submit`,
    {},
    200,
  );
  expect(submitted.visibility).toBe('pending_approval');
  const approved = await post<{ visibility: string }>(
    admin,
    `/program-templates/${tpl.id}/approve`,
    {},
    200,
  );
  expect(approved.visibility).toBe('organization');

  // --- 5. A group run with two mentors ------------------------------------------------------
  type Phase = { id: string; title: string; activities: Array<{ id: string; title: string }> };
  const run = await post<{ id: string; phases: Phase[] }>(admin, '/program-runs', {
    templateId: tpl.id,
    mode: 'group',
    title: `گروه پاییز ${tag}`,
  });
  for (const m of mentors) {
    await post(admin, `/program-runs/${run.id}/staff`, { userId: m.id, role: 'mentor' }, 200);
  }

  // --- 3. The admin imports mentees with a CSV straight into that course ---------------------
  const names = ['سارا', 'امید', 'مهسا'].map((n) => `${n} هنرجو ${tag}`);
  const phones = names.map((_, i) => phoneOf('15', i));
  const csv = ['نام,موبایل', ...names.map((n, i) => `${n},${phones[i]}`)].join('\r\n');
  const imported = await ok<{
    imported: number;
    enrolled: number;
    rows: Array<{ studentId: string; inviteUrl: string }>;
  }>(
    await admin.post('/api/v1/imports/students', {
      multipart: {
        file: { name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') },
        dryRun: 'false',
        runId: run.id,
      },
      ...H,
    }),
  );
  expect(imported).toMatchObject({ imported: 3, enrolled: 3 });
  const studentIds = imported.rows.map((r) => r.studentId);

  // --- 6. Another mentee takes the same path alone ------------------------------------------
  const solo = await post<{ student: { id: string } }>(admin, '/students', {
    displayName: `تک‌رو ${tag}`,
    phone: phoneOf('14', 0),
  });
  const soloRun = await post(admin, '/program-runs', {
    templateId: tpl.id,
    mode: 'individual',
    title: `مسیر تک‌نفره ${tag}`,
  });
  await post(
    admin,
    `/program-runs/${soloRun.id}/enrollments`,
    { studentIds: [solo.student.id] },
    200,
  );

  // --- 7. A one-on-one package: a held session, a next action, the use of the package -------
  const pkgTpl = await post(admin, '/program-templates', {
    kind: 'one_on_one',
    title: `تک‌به‌تک: ۸ جلسه در ۲ ماه ${tag}`,
    sessionQuota: 8,
    sessionMinutes: 60,
    validityDays: 60,
  });
  await post(admin, `/program-templates/${pkgTpl.id}/nodes`, { nodeType: 'phase', title: 'دوره' });
  await post(admin, `/program-templates/${pkgTpl.id}/publish`, {}, 200);
  const pkgRun = await post(admin, '/program-runs', {
    templateId: pkgTpl.id,
    mode: 'individual',
    title: `تک‌به‌تک سارا ${tag}`,
  });
  await post(admin, `/program-runs/${pkgRun.id}/staff`, { userId: m1.id, role: 'mentor' }, 200);
  await post(admin, `/program-runs/${pkgRun.id}/enrollments`, { studentIds: [studentIds[0]] }, 200);
  const pkgDetail = await get<{ enrollments: Array<{ id: string }> }>(
    admin,
    `/program-runs/${pkgRun.id}`,
  );
  const pkgEnrollment = pkgDetail.enrollments[0]?.id;
  const day = (offset: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(
      new Date(Date.now() + offset * 86_400_000),
    );
  const held = await post<{ session: { id: string } }>(m1.api, '/sessions', {
    runId: pkgRun.id,
    enrollmentId: pkgEnrollment,
    day: day(1),
    time: '10:00',
    durationMinutes: 60,
  });
  await patch(m1.api, `/sessions/${held.session.id}`, { status: 'held' });
  await post(m1.api, `/sessions/${held.session.id}/actions`, {
    title: `به‌روز کردن تیتر پروفایل ${tag}`,
    dueDate: day(5),
  });
  await post(m1.api, '/sessions', {
    runId: pkgRun.id,
    enrollmentId: pkgEnrollment,
    day: day(3),
    time: '18:00',
    durationMinutes: 60,
  });
  const usage = await get<{ enrollments: Array<{ usage: { used: number; remaining: number } }> }>(
    admin,
    `/program-runs/${pkgRun.id}`,
  );
  expect(usage.enrollments[0]?.usage).toMatchObject({ used: 1, remaining: 7 });

  // --- 8. The course assignment: mentees submit; mentors accept or ask for changes ----------
  const assignment = run.phases
    .flatMap((p) => p.activities)
    .find((a) => a.title === `انتخاب نیچ ${tag}`)?.id;
  expect(assignment, 'assignment node in the run').toBeTruthy();
  const assigned = await post<{ created: number; taskIds: string[] }>(
    m1.api,
    `/program-runs/${run.id}/nodes/${assignment}/assign`,
    {},
  );
  expect(assigned.created).toBe(3);

  const mentees: Array<{ id: string; name: string; api: APIRequestContext; page: Page }> = [];
  for (const [i, row] of imported.rows.entries()) {
    const signed = await acceptInvite(browser, page, row.inviteUrl, phones[i] ?? '');
    contexts.push(signed.context);
    mentees.push({
      id: row.studentId,
      name: names[i] ?? '',
      api: signed.context.request,
      page: signed.page,
    });
  }
  const [sara, omid, mahsa] = mentees as [
    (typeof mentees)[number],
    (typeof mentees)[number],
    (typeof mentees)[number],
  ];
  const taskOf = async (who: (typeof mentees)[number]) => {
    const list = await get<Array<{ id: string; title: string }> | { items: Array<Json> }>(
      who.api,
      '/me/tasks',
    );
    const items = (Array.isArray(list) ? list : list.items) as Array<{ id: string; title: string }>;
    const task = items.find((t) => t.title === `انتخاب نیچ ${tag}`);
    expect(task, `course task of ${who.name}`).toBeDefined();
    return task?.id ?? '';
  };
  const submissions: string[] = [];
  for (const who of [sara, omid, mahsa]) {
    const sub = await post(who.api, `/tasks/${await taskOf(who)}/submissions`, {
      bodyText: `نیچ من: طراحی لندینگ برای استارتاپ‌ها (${who.name})`,
    });
    submissions.push(sub.id);
  }
  await post(m1.api, `/submissions/${submissions[0]}/review`, {
    outcome: 'accepted',
    feedbackText: 'انتخاب دقیقی است؛ برو سراغ پروفایل.',
  });
  await post(m2.api, `/submissions/${submissions[1]}/review`, {
    outcome: 'changes_requested',
    feedbackText: 'نیچ را باریک‌تر کن.',
  });
  // Mahsa's submission stays in the queue for step 10.

  // --- 9. The mentee sees the feedback, the progress and what happened ----------------------
  await sara.page.goto('/home');
  const programs = sara.page.getByRole('region', { name: 'برنامه‌های من' });
  await expect(programs).toBeVisible(SLOW);
  await expect(programs.getByText(`گروه پاییز ${tag}`)).toBeVisible();
  await expect(programs.getByText('فاز فعلی: شناخت بازار').first()).toBeVisible();
  await expect(programs.getByText(`تک‌به‌تک سارا ${tag}`)).toBeVisible();
  await expect(programs.getByText(/جلسه‌ی بعدی/)).toBeVisible();
  await expectPersianPage(sara.page);
  await sara.page.goto('/my/notifications');
  await expect(sara.page.getByText(`«انتخاب نیچ ${tag}» تأیید شد`)).toBeVisible(SLOW);
  await expect(sara.page.getByText(`کار تازه: «به‌روز کردن تیتر پروفایل ${tag}»`)).toBeVisible();
  await expectPersianPage(sara.page);
  await omid.page.goto('/my/notifications');
  await expect(omid.page.getByText(`برای «انتخاب نیچ ${tag}» اصلاح خواسته شد`)).toBeVisible(SLOW);
  const progress = await get<Array<{ run: { id: string }; progress: { done: number } }>>(
    sara.api,
    '/me/programs',
  );
  expect(progress.find((p) => p.run.id === run.id)?.progress.done).toBe(1);

  // --- 10. The mentor's «امروز»: the pending review and the upcoming session ----------------
  await m1.page.goto('/today');
  await expect(m1.page.locator('#reviews').getByText(mahsa.name)).toBeVisible(SLOW);
  await expect(
    m1.page
      .locator('#sessions')
      .getByText(/۶۰ دقیقه|60/)
      .first(),
  ).toBeVisible();
  await expectPersianPage(m1.page);
  await m1.page.goto('/notifications');
  await expect(m1.page.getByText(`${mahsa.name} «انتخاب نیچ ${tag}» را تحویل داد`)).toBeVisible(
    SLOW,
  );

  // --- 11. The admin sees totals and the mentors' load, never a private note ---------------
  const secret = `یادداشت خصوصی ${tag}: نگران انگیزه‌اش هستم`;
  await post(m1.api, `/students/${sara.id}/notes`, { visibility: 'private', body: secret });
  const own = await get<{ items: Array<{ body: string }> }>(m1.api, `/students/${sara.id}/notes`);
  expect(own.items.map((n) => n.body)).toContain(secret);
  const seen = await get<{ items: Array<{ body: string }> }>(admin, `/students/${sara.id}/notes`);
  expect(seen.items.map((n) => n.body)).not.toContain(secret);
  await page.goto(`/students/${sara.id}`);
  await expect(page.getByRole('heading', { level: 1, name: sara.name })).toBeVisible(SLOW);
  await expect(page.getByText(secret)).toHaveCount(0);
  await page.goto('/overview');
  await expect(page.getByRole('heading', { level: 1, name: 'نمای کلی سازمان' })).toBeVisible(SLOW);
  await expect(page.getByRole('row').filter({ hasText: `گروه پاییز ${tag}` })).toBeVisible();
  for (const m of mentors) {
    // The mentors table: the name also shows in the staff column of the course rows.
    await expect(page.getByRole('row', { name: new RegExp(`^${m.name}`) })).toBeVisible();
  }
  await expect(page.getByText(secret)).toHaveCount(0);
  await expectPersianPage(page);
  const dashboard = await get<{ mentors: Array<{ id: string; students: number }> }>(
    admin,
    '/dashboard/organization',
  );
  expect(dashboard.mentors.find((m) => m.id === m1.id)?.students).toBeGreaterThanOrEqual(3);

  // --- 12. A mentee and the second organization see only their own --------------------------
  expect((await mahsa.api.get(`/api/v1/students/${sara.id}`)).status()).toBe(403);
  const mine = await get<Array<{ run: { id: string } }>>(mahsa.api, '/me/programs');
  expect(mine.map((p) => p.run.id)).not.toContain(pkgRun.id);
  const other = await newContext(browser, page);
  contexts.push(other);
  const op = await other.newPage();
  await signIn(op, state.otherAdmin.phone, state.otherAdmin.password);
  const theirs = await get<{ items: Array<{ id: string }> }>(other.request, '/students');
  expect(theirs.items.map((s) => s.id)).toEqual(
    expect.not.arrayContaining([...studentIds, solo.student.id]),
  );
  for (const url of [
    `/students/${sara.id}`,
    `/program-runs/${run.id}`,
    `/program-templates/${tpl.id}`,
  ]) {
    expect((await other.request.get(`/api/v1${url}`)).status(), url).toBe(404);
  }
  const otherBoard = await get<{ courses: Array<{ id: string }> }>(
    other.request,
    '/dashboard/organization',
  );
  expect(otherBoard.courses.map((c) => c.id)).not.toContain(run.id);
  await op.goto('/students');
  await expect(op.getByRole('heading', { level: 1 })).toBeVisible(SLOW);
  for (const n of names) await expect(op.getByText(n)).toHaveCount(0);

  for (const c of contexts) await c.close();
});

test('step 13: main pages do not break in English (LTR)', async ({ page, browser }) => {
  test.setTimeout(360_000);
  const state = readState();
  test.skip(!state, 'e2e database state not found');
  if (!state) return;
  const tag = `${isMobile(page) ? 'M' : 'D'}${Date.now().toString().slice(-6)}`;
  // Fresh people: the shared e2e admin stays in Persian for the other specs.
  await signIn(page, state.admin.phone, state.admin.password);
  const phone = phoneOf(isMobile(page) ? '13' : '12', 0);
  const invited = await post<{ inviteUrl: string }>(page.request, '/invitations', {
    role: 'admin',
    displayName: `English admin ${tag}`,
    phone,
  });
  const staff = await acceptInvite(browser, page, invited.inviteUrl, phone);
  const menteePhone = phoneOf(isMobile(page) ? '11' : '10', 0);
  const st = await post<{ inviteUrl: string }>(page.request, '/students', {
    displayName: `English mentee ${tag}`,
    phone: menteePhone,
  });
  const mentee = await acceptInvite(browser, page, st.inviteUrl, menteePhone);
  for (const who of [staff, mentee]) {
    await patch(who.context.request, '/auth/preferences', { locale: 'en' });
  }
  for (const path of [
    '/today',
    '/students',
    '/tasks',
    '/questions',
    '/programs',
    '/mentors',
    '/calendar',
    '/overview',
    '/notifications',
  ]) {
    await expectEnglishPage(staff.page, path);
  }
  for (const path of [
    '/home',
    '/my/programs',
    '/my/mentors',
    '/my/tasks',
    '/my/questions',
    '/my/notifications',
  ]) {
    await expectEnglishPage(mentee.page, path);
  }
  await staff.context.close();
  await mentee.context.close();
});
