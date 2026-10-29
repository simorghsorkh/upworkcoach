import { beforeAll, describe, expect, it } from 'vitest';
import { dayIn } from '@/lib/org-day';
import { call, createUser, loginAs, type TestUser } from './helpers';

/**
 * Coach Office sprint 7 (ADR-0014): a mentor sets bookable hours per one-on-one offering; a
 * mentee picks a mentor, sees the free slots and sends a request that holds the slot; the
 * mentor approves it into a session (only once the mentee holds a package) or declines it;
 * the mentee cancels until the offering's notice.
 */

type Booking = {
  id: string;
  status: string;
  hasPackage: boolean;
  sessionId: string | null;
  scheduledAt: string;
  can: { approve: boolean; decline: boolean; cancel: boolean };
};
type Offering = {
  templateId: string;
  active: boolean;
  package: { enrollmentId: string; bookable: number | null } | null;
};
type Mentor = { id: string; offerings: Offering[] };

let admin: TestUser;
let m1: TestUser;
let m2: TestUser;
let s1: TestUser;
let s2: TestUser;
const c: Record<string, Record<string, string>> = {};
let today = '';
let tpl = '';
let runId = '';

const ALL_DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;

async function publishedTemplate(): Promise<string> {
  const res = await call('POST', '/program-templates', {
    cookies: c.admin,
    body: {
      kind: 'one_on_one',
      title: 'مشاوره‌ی تک‌به‌تک رزرو',
      sessionQuota: 4,
      sessionMinutes: 60,
      validityDays: 60,
    },
  });
  expect(res.status).toBe(201);
  const id = res.body.id as string;
  await call('POST', '/program-templates/[id]/nodes', {
    cookies: c.admin,
    params: { id },
    body: { nodeType: 'phase', title: 'جلسه‌ها' },
  });
  const published = await call('POST', '/program-templates/[id]/publish', {
    cookies: c.admin,
    params: { id },
  });
  expect(published.status).toBe(200);
  return id;
}

/** Free slots of m1's offering for a caller, one per day (days far enough apart). */
async function slots(who: string): Promise<string[]> {
  const res = await call('GET', '/mentors/[id]/slots', {
    cookies: c[who],
    params: { id: m1.id },
    query: { templateId: tpl },
  });
  expect(res.status).toBe(200);
  return (res.body.days as Array<{ slots: string[] }>).flatMap((d) => d.slots);
}

/** The first free slot on each day that has one. */
async function slotPerDay(who: string): Promise<string[]> {
  const res = await call('GET', '/mentors/[id]/slots', {
    cookies: c[who],
    params: { id: m1.id },
    query: { templateId: tpl },
  });
  return (res.body.days as Array<{ slots: string[] }>)
    .filter((d) => d.slots.length)
    .map((d) => d.slots[0] as string);
}

async function request(who: string, startsAt: string, note?: string) {
  return call('POST', '/booking-requests', {
    cookies: c[who],
    body: { mentorId: m1.id, templateId: tpl, startsAt, ...(note ? { note } : {}) },
  });
}

async function inbox(
  who: string,
): Promise<Array<{ kind: string; href: string; data: { outcome?: string } }>> {
  return (await call('GET', '/notifications', { cookies: c[who] })).body.items;
}

async function offeringFor(who: string): Promise<Offering | undefined> {
  const res = await call('GET', '/booking/mentors', { cookies: c[who] });
  expect(res.status).toBe(200);
  return (res.body as Mentor[])
    .find((m) => m.id === m1.id)
    ?.offerings.find((o) => o.templateId === tpl);
}

beforeAll(async () => {
  admin = await createUser('admin');
  m1 = await createUser('mentor', { displayName: 'مشاور تقویم' });
  m2 = await createUser('mentor');
  s1 = await createUser('student', { displayName: 'هنرجوی رزرو' });
  s2 = await createUser('student');
  for (const [k, u] of Object.entries({ admin, m1, m2, s1, s2 })) {
    c[k] = (await loginAs(u)).cookies;
  }
  today = dayIn('Asia/Tehran', new Date());
  tpl = await publishedTemplate();
  const run = await call('POST', '/program-runs', {
    cookies: c.admin,
    body: { templateId: tpl, mode: 'individual', title: 'رزرو', startsOn: today },
  });
  expect(run.status).toBe(201);
  runId = run.body.id as string;
  await call('POST', '/program-runs/[id]/staff', {
    cookies: c.admin,
    params: { id: runId },
    body: { userId: m1.id, role: 'mentor' },
  });
  const joined = await call('POST', '/program-runs/[id]/enrollments', {
    cookies: c.admin,
    params: { id: runId },
    body: { studentIds: [s1.id] },
  });
  expect(joined.status).toBe(200);
});

describe('hours and offerings', () => {
  it('a mentor sees the one-on-one templates they could offer, inactive at first', async () => {
    const res = await call('GET', '/mentors/[id]/availability', {
      cookies: c.m1,
      params: { id: m1.id },
    });
    expect(res.status).toBe(200);
    expect(res.body.timeZone).toBe('Asia/Tehran');
    expect(res.body.rules).toEqual([]);
    const own = (res.body.offerings as Offering[]).find((o) => o.templateId === tpl);
    expect(own).toMatchObject({ active: false });
  });

  it('only the mentor themself or an admin manages a calendar', async () => {
    const other = await call('GET', '/mentors/[id]/availability', {
      cookies: c.m2,
      params: { id: m1.id },
    });
    expect(other.status).toBe(404);
    const student = await call('GET', '/mentors/[id]/availability', {
      cookies: c.s1,
      params: { id: m1.id },
    });
    expect(student.status).toBe(403);
    const byAdmin = await call('GET', '/mentors/[id]/availability', {
      cookies: c.admin,
      params: { id: m1.id },
    });
    expect(byAdmin.status).toBe(200);
  });

  it('weekly hours open to a listed offering; an unknown template is refused', async () => {
    const bad = await call('PUT', '/mentors/[id]/availability', {
      cookies: c.m1,
      params: { id: m1.id },
      body: {
        rules: [{ weekday: 'sat', start: '09:00', end: '12:00', templateIds: [m1.id] }],
        dates: [],
      },
    });
    expect(bad.status).toBe(422);
    const range = await call('PUT', '/mentors/[id]/availability', {
      cookies: c.m1,
      params: { id: m1.id },
      body: { rules: [{ weekday: 'sat', start: '12:00', end: '09:00' }], dates: [] },
    });
    expect(range.status).toBe(422);

    const res = await call('PUT', '/mentors/[id]/availability', {
      cookies: c.m1,
      params: { id: m1.id },
      body: {
        rules: ALL_DAYS.map((weekday) => ({
          weekday,
          start: '09:00',
          end: '24:00',
          templateIds: [tpl],
        })),
        dates: [],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(7);
    expect(res.body.rules[0]).toMatchObject({ start: '09:00', end: '24:00', templateIds: [tpl] });
  });

  it('a mentee sees no slots until the offering is active', async () => {
    const res = await call('GET', '/mentors/[id]/slots', {
      cookies: c.s1,
      params: { id: m1.id },
      query: { templateId: tpl },
    });
    expect(res.status).toBe(404);
    const on = await call('PUT', '/mentors/[id]/offerings/[templateId]', {
      cookies: c.m1,
      params: { id: m1.id, templateId: tpl },
      body: {
        active: true,
        bufferMinutes: 15,
        minNoticeHours: 12,
        horizonDays: 14,
        location: null,
      },
    });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ active: true, cancelNoticeHours: 24, sessionMinutes: 60 });
  });
});

describe('the mentee side', () => {
  it('lists the mentor with the offering and the mentee package (if any)', async () => {
    expect((await offeringFor('s1'))?.package).toMatchObject({ bookable: 4 });
    const s2Offering = await offeringFor('s2');
    expect(s2Offering).toBeDefined();
    expect(s2Offering?.package).toBeNull();
    const staff = await call('GET', '/booking/mentors', { cookies: c.m1 });
    expect(staff.status).toBe(403);
  });

  it('free slots are at least the minimum notice away and inside the horizon', async () => {
    const list = await slots('s1');
    expect(list.length).toBeGreaterThan(20);
    const first = new Date(list[0] as string).getTime();
    expect(first - Date.now()).toBeGreaterThanOrEqual(12 * 3_600_000 - 60_000);
    const last = new Date(list.at(-1) as string).getTime();
    expect(last - Date.now()).toBeLessThan(16 * 86_400_000);
  });

  it('a date off removes that day; a date with its own hours replaces the week', async () => {
    const before = await call('GET', '/mentors/[id]/slots', {
      cookies: c.s1,
      params: { id: m1.id },
      query: { templateId: tpl },
    });
    const days = before.body.days as Array<{ day: string; slots: string[] }>;
    const open = days.filter((d) => d.slots.length);
    const target = open.at(-1)?.day as string;
    const custom = open.at(-3)?.day as string;
    const current = await call('GET', '/mentors/[id]/availability', {
      cookies: c.m1,
      params: { id: m1.id },
    });
    const put = await call('PUT', '/mentors/[id]/availability', {
      cookies: c.m1,
      params: { id: m1.id },
      body: {
        rules: current.body.rules,
        dates: [
          { day: target, windows: [] },
          { day: custom, windows: [{ start: '10:00', end: '11:00', templateIds: [tpl] }] },
        ],
      },
    });
    expect(put.status).toBe(200);
    expect(put.body.dates).toEqual([
      { day: custom, windows: [{ start: '10:00', end: '11:00', templateIds: [tpl] }] },
      { day: target, windows: [] },
    ]);
    const dup = await call('PUT', '/mentors/[id]/availability', {
      cookies: c.m1,
      params: { id: m1.id },
      body: { rules: [], dates: [put.body.dates[0], put.body.dates[0]] },
    });
    expect(dup.status).toBe(422);
    const after = await call('GET', '/mentors/[id]/slots', {
      cookies: c.s1,
      params: { id: m1.id },
      query: { templateId: tpl },
    });
    expect(
      (after.body.days as Array<{ day: string; slots: string[] }>).find((d) => d.day === target)
        ?.slots,
    ).toEqual([]);
    expect(
      (after.body.days as Array<{ day: string; slots: string[] }>).find((d) => d.day === custom)
        ?.slots,
    ).toHaveLength(1);
  });
});

describe('requests', () => {
  let picks: string[] = [];
  let r1 = '';
  let r2 = '';

  beforeAll(async () => {
    picks = await slotPerDay('s1');
    expect(picks.length).toBeGreaterThanOrEqual(8);
  });

  it('only a listed free slot can be requested', async () => {
    const odd = new Date(new Date(picks[2] as string).getTime() + 10 * 60_000).toISOString();
    expect((await request('s1', odd)).status).toBe(409);
    const byMentor = await call('POST', '/booking-requests', {
      cookies: c.m1,
      body: { mentorId: m1.id, templateId: tpl, startsAt: picks[2] },
    });
    expect(byMentor.status).toBe(403);
  });

  it('a request with a package holds the slot and tells the mentor', async () => {
    const res = await request('s1', picks[2] as string, 'سلام، درباره‌ی پروپوزال');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'pending',
      hasPackage: true,
      sessionId: null,
      can: { approve: false, decline: false, cancel: true },
    });
    r1 = res.body.id;
    expect(await slots('s2')).not.toContain(picks[2]);
    expect((await request('s2', picks[2] as string)).status).toBe(409);
    expect((await inbox('m1'))[0]).toMatchObject({ kind: 'booking_requested', href: '/calendar' });
    expect((await offeringFor('s1'))?.package).toMatchObject({ bookable: 3 });
  });

  it('a request without a package also reaches the admins', async () => {
    const res = await request('s2', picks[3] as string);
    expect(res.status).toBe(201);
    expect(res.body.hasPackage).toBe(false);
    r2 = res.body.id;
    expect((await inbox('admin')).some((n) => n.kind === 'booking_requested')).toBe(true);
  });

  it('the mentor sees open requests, soonest first; others do not', async () => {
    const res = await call('GET', '/booking-requests', { cookies: c.m1 });
    expect(res.status).toBe(200);
    const list = res.body as Booking[];
    expect(list.map((b) => b.id)).toEqual([r1, r2]);
    expect(list[0]?.can).toEqual({ approve: true, decline: true, cancel: false });
    expect((await call('GET', '/booking-requests', { cookies: c.m2 })).body).toEqual([]);
    const own = (await call('GET', '/booking-requests', { cookies: c.s2 })).body as Booking[];
    expect(own.map((b) => b.id)).toEqual([r2]);
  });

  it('another mentor cannot decide; a mentee cannot approve', async () => {
    const other = await call('POST', '/booking-requests/[id]/approve', {
      cookies: c.m2,
      params: { id: r1 },
    });
    expect(other.status).toBe(404);
    const mentee = await call('POST', '/booking-requests/[id]/approve', {
      cookies: c.s1,
      params: { id: r1 },
    });
    expect(mentee.status).toBe(403);
  });

  it('approving books the session in the package and tells the mentee', async () => {
    const res = await call('POST', '/booking-requests/[id]/approve', {
      cookies: c.m1,
      params: { id: r1 },
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.sessionId).toEqual(expect.any(String));
    const sessions = await call('GET', '/sessions', {
      cookies: c.s1,
      query: { when: 'upcoming' },
    });
    const booked = (
      sessions.body as Array<{ id: string; scheduledAt: string; status: string }>
    ).find((s) => s.id === res.body.sessionId);
    expect(booked).toMatchObject({ status: 'scheduled', scheduledAt: picks[2] });
    expect((await inbox('s1'))[0]).toMatchObject({
      kind: 'booking_decided',
      href: '/my/programs',
      data: { outcome: 'approved' },
    });
    // One session is upcoming: 4 − 1.
    expect((await offeringFor('s1'))?.package).toMatchObject({ bookable: 3 });
    const again = await call('POST', '/booking-requests/[id]/approve', {
      cookies: c.m1,
      params: { id: r1 },
    });
    expect(again.status).toBe(409);
  });

  it('without a package the request waits for the admin to enroll the mentee', async () => {
    const early = await call('POST', '/booking-requests/[id]/approve', {
      cookies: c.m1,
      params: { id: r2 },
    });
    expect(early.status).toBe(409);
    // An individual run holds one mentee: the admin opens s2's own run with m1.
    const run = await call('POST', '/program-runs', {
      cookies: c.admin,
      body: { templateId: tpl, mode: 'individual', title: 'رزرو ۲', startsOn: today },
    });
    await call('POST', '/program-runs/[id]/staff', {
      cookies: c.admin,
      params: { id: run.body.id },
      body: { userId: m1.id, role: 'mentor' },
    });
    const joined = await call('POST', '/program-runs/[id]/enrollments', {
      cookies: c.admin,
      params: { id: run.body.id },
      body: { studentIds: [s2.id] },
    });
    expect(joined.status).toBe(200);
    const res = await call('POST', '/booking-requests/[id]/approve', {
      cookies: c.admin,
      params: { id: r2 },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'approved', hasPackage: true });
  });

  it('declining frees the slot', async () => {
    const res = await request('s1', picks[4] as string);
    expect(res.status).toBe(201);
    const declined = await call('POST', '/booking-requests/[id]/decline', {
      cookies: c.m1,
      params: { id: res.body.id },
      body: { reason: 'آن روز سفرم' },
    });
    expect(declined.status).toBe(200);
    expect(declined.body).toMatchObject({ status: 'declined', declineReason: 'آن روز سفرم' });
    expect(await slots('s2')).toContain(picks[4]);
    expect((await inbox('s1'))[0]?.data.outcome).toBe('declined');
  });

  it('a mentee has at most three live requests', async () => {
    for (const p of [picks[5], picks[6], picks[7]]) {
      expect((await request('s1', p as string)).status).toBe(201);
    }
    const fourth = await request('s1', picks[1] as string);
    expect(fourth.status).toBe(409);
  });

  it('a pending request is cancelled freely and the mentor hears of it', async () => {
    const own = (
      await call('GET', '/booking-requests', { cookies: c.s1, query: { status: 'pending' } })
    ).body as Booking[];
    expect(own).toHaveLength(3);
    const res = await call('POST', '/booking-requests/[id]/cancel', {
      cookies: c.s1,
      params: { id: own[0]?.id as string },
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect((await inbox('m1'))[0]?.kind).toBe('booking_cancelled');
    const twice = await call('POST', '/booking-requests/[id]/cancel', {
      cookies: c.s1,
      params: { id: own[0]?.id as string },
    });
    expect(twice.status).toBe(409);
  });

  it('a booked session is cancelled only before the notice, which cancels the session', async () => {
    await call('PUT', '/mentors/[id]/offerings/[templateId]', {
      cookies: c.m1,
      params: { id: m1.id, templateId: tpl },
      body: { cancelNoticeHours: 336 },
    });
    const late = await call('POST', '/booking-requests/[id]/cancel', {
      cookies: c.s1,
      params: { id: r1 },
    });
    expect(late.status).toBe(409);
    expect(late.body.error.message).toContain('۳۳۶');

    await call('PUT', '/mentors/[id]/offerings/[templateId]', {
      cookies: c.m1,
      params: { id: m1.id, templateId: tpl },
      body: { cancelNoticeHours: 24 },
    });
    const res = await call('POST', '/booking-requests/[id]/cancel', {
      cookies: c.s1,
      params: { id: r1 },
    });
    expect(res.status).toBe(200);
    const sessions = await call('GET', '/sessions', { cookies: c.m1, query: { when: 'upcoming' } });
    expect((sessions.body as Array<{ id: string }>).some((s) => s.id === res.body.sessionId)).toBe(
      false,
    );
    expect(await slots('s2')).toContain(picks[2]);
  });

  it('a mentor who stops accepting students disappears for mentees', async () => {
    const off = await call('PUT', '/mentors/[id]/profile', {
      cookies: c.admin,
      params: { id: m1.id },
      body: { acceptingStudents: false },
    });
    expect(off.status).toBe(200);
    expect(await offeringFor('s1')).toBeUndefined();
    const res = await call('GET', '/mentors/[id]/slots', {
      cookies: c.s1,
      params: { id: m1.id },
      query: { templateId: tpl },
    });
    expect(res.status).toBe(404);
  });
});
