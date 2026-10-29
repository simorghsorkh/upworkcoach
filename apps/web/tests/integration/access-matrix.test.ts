import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { platforms, stages, taskTemplates } from '@/modules/catalog/schema';
import { DEFAULT_ORGANIZATION_ID, sessions } from '@/modules/identity/schema';
import { slidingExpiry } from '@/modules/identity/session-policy';
import { sha256Hex } from '@/modules/identity/tokens';
import { platformProfiles } from '@/modules/students/schema';
import type { Role } from '@/server/auth/current-user';
import { getDb } from '@/server/db';
import { ROUTES, type RouteEntry } from '@/server/http/routes.manifest';
import {
  dayFromToday,
  flagFixture,
  formWith,
  imageBytes,
  milestoneFixture,
  milestoneTypeFixture,
  noteFixture,
  pendingAttachmentFixture,
  questionFixture,
  reminderFixture,
  reviewFixture,
  submittedTaskFixture,
  taskFixture,
} from './fixtures';
import {
  type CallOptions,
  call,
  createUser,
  loginAs,
  ROUTE_MODULES,
  SEEDED,
  SESSION_COOKIE,
  setUserStatus,
  type TestUser,
  uniquePhone,
} from './helpers';

/**
 * T-MATRIX (ADR-0004 section 4): every manifest endpoint × A, M, S, anonymous, disabled with
 * an old cookie, invited with a forged session; plus T-ESC, T-CSRF, T-TOKEN (no :token
 * routes) and API response headers. The matrix student is assigned to the matrix mentor,
 * so "allowed" calls really succeed. The student-scope roles (M-owner, M-other, M-former,
 * S-owner, S-other) are in students-access.test.ts.
 */

const appDir = fileURLToPath(new URL('../../src/app', import.meta.url));

type Who = Role | 'anonymous' | 'disabled' | 'invited';

const cookies: Partial<Record<Who, Record<string, string>>> = {};
const accounts: Partial<Record<Role, TestUser>> = {};
let invitedStudentId = '';
let activeStudentId = '';
let invitedAdminId = '';
let invitedMentorId = '';
let matrixStageId = '';
let matrixPlatformId = '';
let matrixTemplateId = '';
let matrixMilestoneTypeId = '';
let inactiveMilestoneTypeId = '';
let extendDay = 30;

beforeAll(async () => {
  for (const role of ['admin', 'mentor', 'student'] as const) {
    // The matrix student belongs to the matrix mentor (mentor is created first).
    accounts[role] = await createUser(role, { mentorId: accounts.mentor?.id ?? null });
    cookies[role] = (await loginAs(accounts[role])).cookies;
  }
  const [stage] = await getDb()
    .insert(stages)
    .values({
      pathId: SEEDED.path,
      displayCode: 'م',
      name: 'مرحله‌ی ماتریس',
      sortOrder: 9_000,
      isActive: false,
    })
    .returning({ id: stages.id });
  matrixStageId = stage?.id ?? '';
  const [platform] = await getDb()
    .insert(platforms)
    .values({
      organizationId: DEFAULT_ORGANIZATION_ID,
      name: `matrix-${uniquePhone()}`,
      sortOrder: 9_000,
    })
    .returning({ id: platforms.id });
  matrixPlatformId = platform?.id ?? '';
  const [template] = await getDb()
    .insert(taskTemplates)
    .values({ organizationId: DEFAULT_ORGANIZATION_ID, title: 'قالب ماتریس', isActive: false })
    .returning({ id: taskTemplates.id });
  matrixTemplateId = template?.id ?? '';
  matrixMilestoneTypeId = await milestoneTypeFixture();
  inactiveMilestoneTypeId = await milestoneTypeFixture({ isActive: false });
  // A user who was disabled after logging in keeps an old cookie (must be refused).
  const disabled = await createUser('mentor');
  cookies.disabled = (await loginAs(disabled)).cookies;
  await setUserStatus(disabled.id, 'disabled');

  // An invited user can never log in; forge a session row to prove status is checked.
  const invited = await createUser('student', { status: 'invited' });
  const forgedToken = 'f'.repeat(43);
  const now = new Date();
  await getDb()
    .insert(sessions)
    .values({
      organizationId: DEFAULT_ORGANIZATION_ID,
      userId: invited.id,
      tokenHash: sha256Hex(forgedToken),
      createdAt: now,
      expiresAt: slidingExpiry('student', now, now),
    });
  cookies.invited = { [SESSION_COOKIE]: forgedToken };
  cookies.anonymous = {};

  invitedStudentId = invited.id;
  activeStudentId = (await createUser('student')).id;
  invitedAdminId = (await createUser('admin', { status: 'invited' })).id;
  invitedMentorId = (await createUser('mentor', { status: 'invited' })).id;
});

/** A fresh profile of the matrix student (so DELETE never hides it from later probes). */
async function freshProfileId(): Promise<string> {
  const studentId = accounts.student?.id ?? '';
  const [row] = await getDb()
    .insert(platformProfiles)
    .values({
      studentId,
      platformId: SEEDED.platforms.upwork,
      kind: 'profile',
      createdBy: studentId,
    })
    .returning({ id: platformProfiles.id });
  return row?.id ?? '';
}

const mentorId = () => accounts.mentor?.id ?? '';

/** A fresh open task of the matrix student (so state changes never affect later probes). */
async function freshTaskId(): Promise<string> {
  return taskFixture(accounts.student?.id ?? '', mentorId());
}

/** A request that is valid enough to pass validation for an allowed caller. */
async function probe(entry: RouteEntry): Promise<CallOptions> {
  const studentId = accounts.student?.id ?? '';
  switch (`${entry.method} ${entry.path}`) {
    case 'POST /students':
      return { body: { displayName: 'هنرجوی ماتریس', phone: uniquePhone() } };
    case 'POST /program-templates':
      return { body: { kind: 'program', title: 'قالب برنامه‌ی ماتریس' } };
    case 'POST /program-runs':
      return { body: { kind: 'one_on_one', mode: 'individual', title: 'اجرای ماتریس' } };
    // Programs (ADR-0012): valid bodies, no params (the ids 404 for allowed callers).
    case 'POST /program-templates/[id]/duplicate':
      return { body: { title: 'کپی ماتریس' } };
    case 'POST /program-templates/[id]/reject':
      return { body: { reason: 'دلیل ماتریس' } };
    case 'POST /program-templates/[id]/nodes':
      return { body: { nodeType: 'phase', title: 'فاز ماتریس' } };
    case 'PUT /program-templates/[id]/nodes/order':
      return { body: { parentId: null, nodeIds: ['01900000-0000-7000-8000-0000000000fe'] } };
    case 'POST /program-runs/[id]/staff':
      return { body: { userId: mentorId(), role: 'mentor' } };
    case 'POST /program-runs/[id]/enrollments':
      return { body: { studentIds: [studentId] } };
    case 'PATCH /enrollments/[id]':
      return { body: { status: 'paused', pausedUntil: dayFromToday(3) } };
    case 'PUT /enrollments/[id]/phase':
      return { body: { toNodeId: '01900000-0000-7000-8000-0000000000fe', kind: 'advance' } };
    // Mentor relationship and directory (Coach Office sprint 4).
    case 'POST /enrollments/[id]/mentors':
      return { body: { mentorId: mentorId(), role: 'secondary' } };
    case 'PUT /mentors/[id]/profile':
      return { body: { bio: 'معرفی ماتریس' } };
    case 'POST /mentors/[id]/transfer':
      return { body: { toMentorId: mentorId() } };
    // Program assignments and progress (Coach Office sprint 5).
    case 'POST /program-runs/[id]/nodes/[nodeId]/assign':
      return { body: {} };
    case 'PUT /enrollments/[id]/nodes/[nodeId]/completion':
      return { body: { done: true } };
    // Bookable hours and booking requests (Coach Office sprint 7).
    case 'PUT /mentors/[id]/availability':
      return { body: { rules: [], dates: [] } };
    case 'PUT /mentors/[id]/offerings/[templateId]':
      return { body: { active: false } };
    case 'GET /mentors/[id]/slots':
      return { query: { templateId: '00000000-0000-7000-8000-000000000000' } };
    case 'POST /booking-requests':
      return {
        body: {
          mentorId: mentorId(),
          templateId: '00000000-0000-7000-8000-000000000000',
          startsAt: '2026-12-01T10:00:00.000Z',
        },
      };
    case 'POST /booking-requests/[id]/decline':
      return { body: {} };
    // Sessions and goals (Coach Office sprint 5b).
    case 'POST /sessions':
      return {
        body: {
          runId: '00000000-0000-7000-8000-000000000000',
          day: '2026-12-01',
          time: '10:00',
          durationMinutes: 60,
        },
      };
    case 'PATCH /sessions/[id]':
      return { body: { status: 'held' } };
    case 'POST /sessions/[id]/actions':
      return { body: { title: 'x', dueDate: '2026-12-01' } };
    case 'POST /enrollments/[id]/goals':
      return { body: { title: 'x' } };
    case 'PATCH /goals/[id]':
      return { body: { status: 'achieved' } };
    case 'GET /students/[id]':
    case 'GET /students/[id]/summary':
    case 'GET /students/[id]/profiles':
    case 'GET /students/[id]/stage-history':
      return { params: { id: studentId } };
    case 'PATCH /students/[id]':
      return { params: { id: studentId }, body: { hoursPerWeek: 5 } };
    case 'PUT /students/[id]/mentor':
      return { params: { id: studentId }, body: { mentorId: accounts.mentor?.id ?? null } };
    case 'PUT /students/[id]/lifecycle':
      return { params: { id: studentId }, body: { status: 'active' } };
    case 'POST /students/[id]/profiles':
      return {
        params: { id: studentId },
        body: { platformId: SEEDED.platforms.fiverr, kind: 'gig' },
      };
    case 'PUT /students/[id]/stage':
      return {
        params: { id: studentId },
        body: { toStageId: SEEDED.stages[1], kind: 'advance' },
      };
    case 'PATCH /me/student':
      return { body: { hoursPerWeek: 6 } };
    case 'POST /me/profiles':
      return { body: { platformId: SEEDED.platforms.linkedin, kind: 'linkedin' } };
    case 'PATCH /profiles/[id]':
      return { params: { id: await freshProfileId() }, body: { headline: 'Matrix headline' } };
    case 'DELETE /profiles/[id]':
    case 'POST /profiles/[id]/approve':
    case 'GET /profiles/[id]/snapshots':
      return { params: { id: await freshProfileId() } };
    case 'POST /profiles/[id]/snapshots':
      return { params: { id: await freshProfileId() }, body: { bodyText: 'Matrix body' } };
    case 'POST /stages':
      return { body: { displayCode: 'م', name: 'مرحله‌ی آزمایشی', isActive: false } };
    case 'PATCH /stages/[id]':
      return { params: { id: matrixStageId }, body: { name: 'مرحله‌ی ماتریس' } };
    case 'POST /stages/[id]/deactivate':
      return { params: { id: matrixStageId } };
    case 'PUT /stages/order': {
      const rows = await getDb()
        .select({ id: stages.id })
        .from(stages)
        .orderBy(asc(stages.sortOrder), asc(stages.createdAt));
      return { body: { stageIds: rows.map((r) => r.id) } };
    }
    case 'POST /platforms':
      return { body: { name: `platform-${uniquePhone()}` } };
    case 'PATCH /platforms/[id]':
      return { params: { id: matrixPlatformId }, body: { sortOrder: 9_001 } };
    // ---- sprint 3 ----
    case 'GET /students/[id]/tasks':
    case 'GET /students/[id]/notes':
    case 'GET /students/[id]/timeline':
      return { params: { id: studentId } };
    case 'POST /students/[id]/tasks':
      return { params: { id: studentId }, body: { title: 'کار ماتریس', dueDate: dayFromToday(2) } };
    case 'POST /tasks/bulk':
      return { body: { studentIds: [studentId], title: 'کار گروهی ماتریس' } };
    case 'GET /tasks/[id]':
      return { params: { id: await freshTaskId() } };
    case 'PATCH /tasks/[id]':
      return { params: { id: await freshTaskId() }, body: { title: 'عنوان تازه' } };
    case 'POST /tasks/[id]/extend':
      extendDay += 1;
      return {
        params: { id: await freshTaskId() },
        body: { newDueDate: dayFromToday(extendDay), reason: 'تمدید ماتریس' },
      };
    case 'POST /tasks/[id]/cancel':
      return { params: { id: await freshTaskId() }, body: { reason: 'لغو ماتریس' } };
    case 'POST /tasks/[id]/start':
      return { params: { id: await freshTaskId() } };
    case 'POST /tasks/[id]/submissions':
      return { params: { id: await freshTaskId() }, body: { bodyText: 'تحویل ماتریس' } };
    case 'POST /submissions/[id]/review':
      return {
        params: { id: (await submittedTaskFixture(studentId, mentorId())).submissionId },
        body: { outcome: 'accepted', feedbackText: 'خوب بود' },
      };
    case 'PATCH /reviews/[id]':
      return {
        params: { id: (await reviewFixture(studentId, mentorId())).reviewId },
        body: { feedbackText: 'بازخورد اصلاح‌شده' },
      };
    case 'POST /task-templates':
      return { body: { title: 'قالب آزمایشی', isActive: false } };
    case 'PATCH /task-templates/[id]':
      return { params: { id: matrixTemplateId }, body: { sortOrder: 5 } };
    case 'POST /students/[id]/notes':
      return { params: { id: studentId }, body: { body: 'یادداشت ماتریس' } };
    case 'PATCH /notes/[id]':
      return { params: { id: await noteFixture(studentId, mentorId()) }, body: { body: 'تازه' } };
    case 'DELETE /notes/[id]':
      return { params: { id: await noteFixture(studentId, mentorId()) } };
    case 'POST /reminders':
      return { body: { text: 'یادآور ماتریس', dueDate: dayFromToday(1) } };
    case 'PATCH /reminders/[id]':
      return { params: { id: await reminderFixture(mentorId()) }, body: { text: 'تازه' } };
    case 'DELETE /reminders/[id]':
    case 'POST /reminders/[id]/done':
      return { params: { id: await reminderFixture(mentorId()) } };
    case 'POST /reminders/[id]/snooze':
      return { params: { id: await reminderFixture(mentorId()) }, body: { days: 3 } };
    case 'POST /imports/students': {
      const form = new FormData();
      // dryRun (default): validates only, writes nothing.
      const csv = `نام,موبایل\nماتریس,${uniquePhone()}\n`;
      form.set('file', new File([csv], 'a.csv', { type: 'text/csv' }));
      return { form };
    }
    case 'POST /attachments':
      return { form: formWith(await imageBytes()) };
    case 'GET /attachments/[id]':
      return { params: { id: await pendingAttachmentFixture(studentId) } };
    // ---- sprint 4 ----
    case 'GET /students/[id]/health':
    case 'DELETE /students/[id]/health/snooze':
    case 'GET /students/[id]/flags':
    case 'GET /students/[id]/checkins':
    case 'GET /students/[id]/milestones':
      return { params: { id: studentId } };
    case 'PUT /students/[id]/health/snooze':
      return { params: { id: studentId }, body: { until: dayFromToday(3), reason: 'سفر' } };
    case 'POST /students/[id]/flags':
      return { params: { id: studentId }, body: { category: 'other', level: 'yellow' } };
    case 'POST /flags/[id]/clear':
      return { params: { id: await flagFixture(studentId, mentorId()) } };
    case 'POST /admin/health/recompute':
      return { body: { studentId } };
    case 'POST /me/questions':
      return { body: { subject: 'سؤال ماتریس', body: 'متن سؤال ماتریس' } };
    case 'GET /questions/[id]':
    case 'POST /questions/[id]/close':
      return { params: { id: await questionFixture(studentId, mentorId()) } };
    case 'POST /questions/[id]/messages':
      return {
        params: { id: await questionFixture(studentId, mentorId()) },
        body: { body: 'پاسخ' },
      };
    case 'PUT /questions/[id]/assignee':
      return {
        params: { id: await questionFixture(studentId, mentorId()) },
        body: { assigneeId: mentorId() },
      };
    case 'POST /canned-responses':
      return { body: { title: 'پاسخ ماتریس', body: 'متن', isActive: false } };
    case 'PATCH /canned-responses/[id]':
      return { params: { id: SEEDED.cannedResponses.redLine }, body: { isActive: true } };
    case 'POST /me/checkins':
      return { body: { mood: 4, needsHelp: false } };
    case 'POST /milestone-types':
      return { body: { name: 'نوع ماتریس', isActive: false } };
    case 'PATCH /milestone-types/[id]':
      return { params: { id: inactiveMilestoneTypeId }, body: { sortOrder: 9_001 } };
    case 'POST /students/[id]/milestones':
      return {
        params: { id: studentId },
        body: { typeId: matrixMilestoneTypeId, occurredOn: dayFromToday(0) },
      };
    case 'POST /me/milestones':
      return { body: { typeId: matrixMilestoneTypeId, occurredOn: dayFromToday(0) } };
    case 'POST /milestones/[id]/approve':
      return { params: { id: await milestoneFixture(studentId, matrixMilestoneTypeId) } };
    case 'POST /milestones/[id]/reject':
      return {
        params: { id: await milestoneFixture(studentId, matrixMilestoneTypeId) },
        body: { reason: 'مدرک کافی نیست' },
      };
    case 'PUT /settings':
      // An empty update writes nothing (the shared settings never change here).
      return { body: {} };
    case 'PUT /settings/[key]':
      // The default value again: the shared settings stay equivalent for parallel files.
      return { params: { key: 'tasks' }, body: { defaultDueDays: 3 } };
    case 'POST /auth/login':
      return { body: { phone: uniquePhone(), password: 'whatever-password' } };
    case 'POST /auth/tokens/lookup':
      return { body: { token: 'q'.repeat(43) } };
    case 'POST /auth/tokens/accept':
      return {
        body: { token: 'q'.repeat(43), phone: uniquePhone(), password: 'whatever-password' },
      };
    case 'POST /invitations':
      return { body: { role: 'mentor', displayName: 'ماتریس', phone: uniquePhone() } };
    case 'POST /users/[id]/invite-link':
      return { params: { id: invitedStudentId } };
    case 'POST /users/[id]/reset-link':
      return { params: { id: activeStudentId } };
    case 'POST /auth/change-password':
      // Wrong current password on purpose: the shared accounts never change.
      return { body: { currentPassword: 'not-the-password', newPassword: 'another-long-pass-1' } };
    case 'PATCH /users/[id]':
      // A fresh mentor each time, renamed only (no session or admin-set side effects).
      return {
        params: { id: (await createUser('mentor')).id },
        body: { displayName: 'مشاور ماتریس' },
      };
    case 'PATCH /users/[id]/role':
      return { params: { id: (await createUser('mentor')).id }, body: { role: 'mentor' } };
    case 'POST /auth/reauth':
      // Wrong password on purpose (422): the shared sessions are not changed.
      return { body: { password: 'not-the-password' } };
    case 'DELETE /auth/sessions/[id]':
      return { params: { id: '01900000-0000-7000-8000-0000000000ff' } };
    default:
      return {};
  }
}

function expected(entry: RouteEntry, who: Who): 'public' | 401 | 403 | 'allowed' {
  if (entry.access === 'public') return 'public';
  if (who === 'anonymous' || who === 'disabled' || who === 'invited') return 401;
  if (entry.access === 'any') return 'allowed';
  return entry.access.includes(who) ? 'allowed' : 403;
}

const WHO: Who[] = ['admin', 'mentor', 'student', 'anonymous', 'disabled', 'invited'];

describe('route manifest is complete (T-MATRIX, T-TOKEN)', () => {
  const routeFiles = (function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name === 'route.ts' ? [full] : [];
    });
  })(path.join(appDir, 'api', 'v1'));

  it('every route.ts under /api/v1 is in the manifest, and vice versa', () => {
    const onDisk = routeFiles
      .map(
        (file) =>
          `/${path
            .relative(path.join(appDir, 'api', 'v1'), path.dirname(file))
            .split(path.sep)
            .join('/')}`,
      )
      .sort();
    const inManifest = [...new Set(ROUTES.map((r) => r.path))].sort();
    expect(onDisk).toEqual(inManifest);
    expect(Object.keys(ROUTE_MODULES).sort()).toEqual(inManifest);
  });

  it('every manifest entry has a handler, and every exported handler is in the manifest', () => {
    for (const [routePath, mod] of Object.entries(ROUTE_MODULES)) {
      const exported = Object.keys(mod)
        .filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k))
        .sort();
      const listed = ROUTES.filter((r) => r.path === routePath)
        .map((r) => r.method)
        .sort();
      expect({ routePath, methods: exported }).toEqual({ routePath, methods: listed });
    }
  });

  it('no page or API path has a [token] segment (C1)', () => {
    const all = (function walk(dir: string): string[] {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory() ? [entry.name, ...walk(path.join(dir, entry.name))] : [],
        );
    })(appDir);
    expect(all.filter((name) => /token/i.test(name) && name.startsWith('['))).toEqual([]);
    expect(ROUTES.some((r) => /token\]/i.test(r.path))).toBe(false);
  });

  it('no Server Actions anywhere in src (SEC-A10)', () => {
    const srcDir = path.join(appDir, '..');
    const offenders = (function walk(dir: string): string[] {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        if (!/\.(ts|tsx)$/.test(entry.name)) return [];
        return /^\s*['"]use server['"]/m.test(fs.readFileSync(full, 'utf8')) ? [full] : [];
      });
    })(srcDir);
    expect(offenders).toEqual([]);
  });
});

describe('access matrix (T-MATRIX)', () => {
  for (const entry of ROUTES) {
    for (const who of WHO) {
      it(`${entry.method} ${entry.path} as ${who}`, async () => {
        // Logout would end the shared session of this role; use a throwaway one.
        const account = who in accounts ? accounts[who as Role] : undefined;
        const callerCookies =
          entry.path === '/auth/logout' && account
            ? (await loginAs(account)).cookies
            : cookies[who];
        const res = await call(entry.method, entry.path, {
          ...(await probe(entry)),
          cookies: callerCookies,
        });
        const want = expected(entry, who);
        if (want === 'public') {
          expect(res.status).not.toBe(403);
          expect(res.body?.error?.code).not.toBe('UNAUTHENTICATED');
        } else if (want === 'allowed') {
          expect([401, 403]).not.toContain(res.status);
          if (!entry.scoped) expect(res.status).toBeLessThan(400);
        } else {
          expect(res.status).toBe(want);
        }
        // SEC-H3 / SEC-C5 on every API response.
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        for (const key of res.headers.keys()) expect(key).not.toMatch(/^access-control-/);
      });
    }
  }
});

describe('privilege escalation (T-ESC, C3)', () => {
  it('a mentor cannot get an invite link for an invited admin or mentor — same 404 as a missing id', async () => {
    const missing = await call('POST', '/users/[id]/invite-link', {
      cookies: cookies.mentor,
      params: { id: '01900000-0000-7000-8000-000000000000' },
    });
    expect(missing.status).toBe(404);
    for (const id of [invitedAdminId, invitedMentorId]) {
      const res = await call('POST', '/users/[id]/invite-link', {
        cookies: cookies.mentor,
        params: { id },
      });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(missing.body);
    }
  });

  it('a mentor gets 201 for an invited student of their own (C3)', async () => {
    const own = await createUser('student', {
      status: 'invited',
      mentorId: accounts.mentor?.id ?? null,
    });
    const res = await call('POST', '/users/[id]/invite-link', {
      cookies: cookies.mentor,
      params: { id: own.id },
    });
    expect(res.status).toBe(201);
  });

  it('a mentor gets 404 for an invited student outside the scope (unassigned)', async () => {
    const res = await call('POST', '/users/[id]/invite-link', {
      cookies: cookies.mentor,
      params: { id: invitedStudentId },
    });
    expect(res.status).toBe(404);
  });

  it('the admin can (re)create those invite links', async () => {
    for (const id of [invitedAdminId, invitedMentorId, invitedStudentId]) {
      const res = await call('POST', '/users/[id]/invite-link', {
        cookies: cookies.admin,
        params: { id },
      });
      expect(res.status).toBe(201);
    }
  });

  it('a non-UUID path id is a plain 404', async () => {
    const res = await call('POST', '/users/[id]/reset-link', {
      cookies: cookies.admin,
      params: { id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('a mentor cannot create invitations for admins (403), even with a crafted body', async () => {
    const res = await call('POST', '/invitations', {
      cookies: cookies.mentor,
      body: { role: 'admin', displayName: 'نفوذی', phone: uniquePhone() },
    });
    expect(res.status).toBe(403);
  });

  it('invitations only accept mentor or admin roles (students come from POST /students)', async () => {
    const res = await call('POST', '/invitations', {
      cookies: cookies.admin,
      body: { role: 'student', displayName: 'هنرجو', phone: uniquePhone() },
    });
    expect(res.status).toBe(422);
  });
});

describe('CSRF (T-CSRF) on every state-changing endpoint', () => {
  const writes = ROUTES.filter((r) => r.method !== 'GET');

  for (const entry of writes) {
    it(`${entry.method} ${entry.path}`, async () => {
      const base = { ...(await probe(entry)), cookies: cookies.admin };
      const statusOf = async (extra: CallOptions) =>
        (await call(entry.method, entry.path, { ...base, ...extra })).status;

      expect(await statusOf({ origin: null })).toBe(403);
      expect(await statusOf({ origin: 'https://app.test.evil.com' })).toBe(403);
      expect(await statusOf({ origin: 'http://app.test' })).toBe(403);
      expect(await statusOf({ origin: 'https://evil.com' })).toBe(403);
      expect(await statusOf({ headers: { 'sec-fetch-site': 'cross-site' } })).toBe(403);
      expect(await statusOf({ rawBody: '{}', contentType: 'text/plain' })).toBe(415);
      expect(
        await statusOf({ rawBody: 'a=1', contentType: 'application/x-www-form-urlencoded' }),
      ).toBe(415);
    });
  }

  it('rejects oversized bodies before parsing (SEC-V1)', async () => {
    const res = await call('POST', '/auth/login', {
      rawBody: JSON.stringify({ phone: '09120000000', password: 'x'.repeat(300 * 1024) }),
    });
    expect(res.status).toBe(413);
  });

  it('rejects invalid JSON with 422', async () => {
    const res = await call('POST', '/auth/login', { rawBody: '{"phone":' });
    expect(res.status).toBe(422);
  });
});
