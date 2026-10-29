import { and, eq, gt, type SQL, sql } from 'drizzle-orm';
import { messagesFor } from '@/i18n/messages';
import { formatCount, translate } from '@/i18n/translate';
import { dayIn } from '@/lib/org-day';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { ApiError, errors } from '@/server/http/errors';
import { cancelBookedSession, insertBookedSession } from '../mentoring/service';
import { notify } from '../notifications/service';
import { packageUsage } from '../programs/progress';
import { organizationTimeZone } from '../programs/service';
import type {
  AvailabilityDTO,
  AvailabilityInput,
  BookableMentorDTO,
  BookingDTO,
  BookingListQuery,
  BookingPackageDTO,
  CreateBookingInput,
  DateHoursDTO,
  OfferingDTO,
  OfferingInput,
  SlotsDTO,
} from './contracts';
import * as repo from './repo';
import { bookingRequests } from './schema';
import { freeSlots, isFreeSlot, type OfferingInput as SlotOffering } from './slots';

/**
 * scheduling — bookable hours, offerings and booking requests (Coach Office sprint 7,
 * ADR-0014). A mentor (or an admin for them) sets weekly hours, day exceptions and which
 * one-on-one templates they take bookings for. A mentee sees the mentors taking bookings and
 * their free slots, and sends a request that holds the slot; only the mentor (or an admin)
 * turns it into a session, and only once the mentee holds a package of that template with
 * that mentor. A request is checked against the free slots inside a per-mentor lock.
 */

const M = messagesFor('fa').schedulingErrors;

/** A pending request holds its slot at most this long (never past its start). */
const HOLD_MS = 48 * 3_600_000;
/** Live requests one mentee may have at once. */
const MAX_LIVE_REQUESTS = 3;
const DEFAULT_SESSION_MINUTES = 60;

const toTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const toMinute = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

/** Admin: any active staff member; mentor: themself only. Else 404 (no existence leak). */
async function staffTarget(db: DbOrTx, actor: Actor, mentorId: string) {
  assertStaff(actor);
  if (actor.role === 'mentor' && mentorId !== actor.userId) throw errors.notFound();
  const [mentor] = await repo.listStaff(db, actor.organizationId, [mentorId]);
  if (!mentor) throw errors.notFound();
  return mentor;
}

function offeringDTO(r: repo.OfferingRow): OfferingDTO {
  return {
    templateId: r.templateId,
    title: r.title,
    description: r.description,
    sessionMinutes: r.sessionMinutes ?? DEFAULT_SESSION_MINUTES,
    sessionQuota: r.sessionQuota,
    validityDays: r.validityDays,
    active: r.active ?? false,
    bufferMinutes: r.bufferMinutes ?? 15,
    minNoticeHours: r.minNoticeHours ?? 12,
    horizonDays: r.horizonDays ?? 21,
    cancelNoticeHours: r.cancelNoticeHours ?? 24,
    location: r.location,
  };
}

const slotOffering = (o: OfferingDTO): SlotOffering => ({
  templateId: o.templateId,
  durationMinutes: o.sessionMinutes,
  bufferMinutes: o.bufferMinutes,
  minNoticeHours: o.minNoticeHours,
  horizonDays: o.horizonDays,
});

// ---- hours and offerings -------------------------------------------------------------------

/** Calendars the caller manages: an admin any staff member's, a mentor their own. */
export async function listCalendarMentors(
  actor: Actor,
  db: DbOrTx = getDb(),
): Promise<Array<{ id: string; displayName: string }>> {
  assertStaff(actor);
  const staff = await repo.listStaff(
    db,
    actor.organizationId,
    actor.role === 'admin' ? undefined : [actor.userId],
  );
  return staff.map((s) => ({ id: s.id, displayName: s.displayName }));
}

/** A date's rows as one entry: an `off` row = no windows. */
function datesOf(rows: Awaited<ReturnType<typeof repo.listExceptions>>): DateHoursDTO[] {
  const byDay = new Map<string, DateHoursDTO>();
  for (const r of rows) {
    const date = byDay.get(r.day) ?? { day: r.day, windows: [] };
    byDay.set(r.day, date);
    if (r.kind === 'hours' && r.startMinute !== null && r.endMinute !== null) {
      date.windows.push({
        start: toTime(r.startMinute),
        end: toTime(r.endMinute),
        templateIds: r.templateIds,
      });
    }
  }
  return [...byDay.values()];
}

/** GET /mentors/:id/availability. */
export async function getAvailability(
  actor: Actor,
  mentorId: string,
  now: Date = new Date(),
  db: DbOrTx = getDb(),
): Promise<AvailabilityDTO> {
  const mentor = await staffTarget(db, actor, mentorId);
  const org = actor.organizationId;
  const timeZone = await organizationTimeZone(db, org);
  const [rules, exceptions, offerings] = await Promise.all([
    repo.listRules(db, org, mentorId),
    repo.listExceptions(db, org, mentorId, dayIn(timeZone, now)),
    repo.listOfferings(db, org, [mentorId], { activeOnly: false }),
  ]);
  return {
    mentor: { id: mentor.id, displayName: mentor.displayName },
    timeZone,
    rules: rules.map((r) => ({
      weekday: r.weekday,
      start: toTime(r.startMinute),
      end: toTime(r.endMinute),
      templateIds: r.templateIds,
    })),
    dates: datesOf(exceptions),
    offerings: offerings
      .map(offeringDTO)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title)),
  };
}

/** PUT /mentors/:id/availability: replaces the weekly hours and the exceptions. */
export async function setAvailability(
  actor: Actor,
  mentorId: string,
  input: AvailabilityInput,
  now: Date = new Date(),
  db: Db = getDb(),
): Promise<AvailabilityDTO> {
  await db.transaction(async (tx) => {
    await staffTarget(tx, actor, mentorId);
    const offered = new Set(
      (await repo.listOfferings(tx, actor.organizationId, [mentorId], { activeOnly: false })).map(
        (o) => o.templateId,
      ),
    );
    const templates = [
      ...input.rules.flatMap((r) => r.templateIds ?? []),
      ...input.dates.flatMap((d) => d.windows.flatMap((w) => w.templateIds ?? [])),
    ];
    if (templates.some((t) => !offered.has(t))) {
      throw errors.validation({ rules: M.unknownTemplate });
    }
    await repo.replaceHours(
      tx,
      actor.organizationId,
      mentorId,
      input.rules.map((r) => ({
        weekday: r.weekday,
        startMinute: toMinute(r.start),
        endMinute: toMinute(r.end),
        templateIds: [...new Set(r.templateIds ?? [])],
      })),
      input.dates.flatMap((d): repo.DateRow[] =>
        d.windows.length
          ? d.windows.map((w) => ({
              day: d.day,
              kind: 'hours',
              startMinute: toMinute(w.start),
              endMinute: toMinute(w.end),
              templateIds: [...new Set(w.templateIds ?? [])],
            }))
          : [{ day: d.day, kind: 'off', startMinute: null, endMinute: null, templateIds: [] }],
      ),
    );
  });
  return getAvailability(actor, mentorId, now, db);
}

/** PUT /mentors/:id/offerings/:templateId. */
export async function setOffering(
  actor: Actor,
  mentorId: string,
  templateId: string,
  input: OfferingInput,
  db: Db = getDb(),
): Promise<OfferingDTO> {
  return db.transaction(async (tx) => {
    await staffTarget(tx, actor, mentorId);
    const [current] = await repo.listOfferings(tx, actor.organizationId, [mentorId], {
      activeOnly: false,
      templateId,
    });
    if (!current) throw errors.notFound();
    const dto = offeringDTO(current);
    const next = {
      active: input.active ?? (current.active === null ? true : dto.active),
      bufferMinutes: input.bufferMinutes ?? dto.bufferMinutes,
      minNoticeHours: input.minNoticeHours ?? dto.minNoticeHours,
      horizonDays: input.horizonDays ?? dto.horizonDays,
      cancelNoticeHours: input.cancelNoticeHours ?? dto.cancelNoticeHours,
      location: input.location !== undefined ? input.location : dto.location,
    };
    await repo.upsertOffering(tx, {
      organizationId: actor.organizationId,
      mentorId,
      templateId,
      ...next,
      updatedAt: new Date(),
    });
    return { ...dto, ...next };
  });
}

// ---- for mentees -------------------------------------------------------------------------------

async function packageDTO(
  db: DbOrTx,
  org: string,
  studentId: string,
  templateId: string,
  mentorId: string,
  now: Date,
  timeZone: string,
): Promise<BookingPackageDTO | null> {
  const p = await repo.packageOf(db, org, studentId, templateId, mentorId, now);
  if (!p) return null;
  const usage = packageUsage({
    quota: p.sessionQuota,
    validUntil: p.validUntil,
    sessions: p.sessions,
    today: dayIn(timeZone, now),
  });
  if (usage.expired) return null;
  return {
    enrollmentId: p.id,
    usage,
    bookable:
      usage.remaining === null ? null : Math.max(usage.remaining - p.upcoming - p.heldRequests, 0),
  };
}

/** GET /booking/mentors (S): mentors taking bookings and what each offers this mentee. */
export async function listBookableMentors(
  actor: Actor,
  now: Date = new Date(),
  db: DbOrTx = getDb(),
): Promise<BookableMentorDTO[]> {
  if (actor.role !== 'student') throw errors.forbidden();
  const org = actor.organizationId;
  const staff = (await repo.listStaff(db, org)).filter((s) => s.accepting);
  const [offerings, timeZone] = await Promise.all([
    repo.listOfferings(
      db,
      org,
      staff.map((s) => s.id),
      { activeOnly: true },
    ),
    organizationTimeZone(db, org),
  ]);
  const out: BookableMentorDTO[] = [];
  for (const s of staff) {
    const own = offerings.filter((o) => o.mentorId === s.id);
    if (!own.length) continue;
    out.push({
      id: s.id,
      displayName: s.displayName,
      specialties: s.specialties ?? [],
      bio: s.bio,
      offerings: await Promise.all(
        own.map(async (o) => ({
          ...offeringDTO(o),
          package: await packageDTO(db, org, actor.userId, o.templateId, s.id, now, timeZone),
        })),
      ),
    });
  }
  return out;
}

async function loadOffering(db: DbOrTx, actor: Actor, mentorId: string, templateId: string) {
  const [mentor] = await repo.listStaff(db, actor.organizationId, [mentorId]);
  if (!mentor) throw errors.notFound();
  const [row] = await repo.listOfferings(db, actor.organizationId, [mentorId], {
    activeOnly: true,
    templateId,
  });
  if (!row || (actor.role === 'student' && !mentor.accepting)) throw errors.notFound();
  return { mentor, offering: offeringDTO(row) };
}

async function slotInput(
  db: DbOrTx,
  org: string,
  mentorId: string,
  offering: OfferingDTO,
  now: Date,
  exceptRequestId: string | null = null,
) {
  const timeZone = await organizationTimeZone(db, org);
  const [rules, exceptions, busy] = await Promise.all([
    repo.listRules(db, org, mentorId),
    repo.listExceptions(db, org, mentorId, dayIn(timeZone, now)),
    repo.busyOf(db, org, mentorId, now, now, exceptRequestId),
  ]);
  return {
    timeZone,
    now,
    offering: slotOffering(offering),
    rules,
    exceptions,
    busy,
  };
}

/** GET /mentors/:id/slots?templateId=: free slots of an active offering. */
export async function getSlots(
  actor: Actor,
  mentorId: string,
  templateId: string,
  now: Date = new Date(),
  db: DbOrTx = getDb(),
): Promise<SlotsDTO> {
  if (actor.role === 'mentor' && mentorId !== actor.userId) {
    // Mentors preview their own calendar only.
    throw errors.notFound();
  }
  const { offering } = await loadOffering(db, actor, mentorId, templateId);
  const input = await slotInput(db, actor.organizationId, mentorId, offering, now);
  return {
    timeZone: input.timeZone,
    durationMinutes: offering.sessionMinutes,
    days: freeSlots(input).map((d) => ({
      day: d.day,
      slots: d.slots.map((s) => s.startsAt.toISOString()),
    })),
  };
}

// ---- requests ------------------------------------------------------------------------------

async function lockMentor(tx: DbOrTx, mentorId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`scheduling.mentor:${mentorId}`}))`);
}

const isExpired = (r: { status: string; holdUntil: Date }, now: Date) =>
  r.status === 'pending' && r.holdUntil.getTime() <= now.getTime();

/** POST /booking-requests (S). */
export async function createBooking(
  actor: Actor,
  input: CreateBookingInput,
  now: Date = new Date(),
  db: Db = getDb(),
): Promise<BookingDTO> {
  if (actor.role !== 'student') throw errors.forbidden();
  const startsAt = new Date(input.startsAt);
  const id = await db.transaction(async (tx) => {
    await lockMentor(tx, input.mentorId);
    const { offering } = await loadOffering(tx, actor, input.mentorId, input.templateId);
    if ((await repo.countLiveRequests(tx, actor.userId, now)) >= MAX_LIVE_REQUESTS) {
      throw errors.conflict(M.tooManyRequests);
    }
    const slots = await slotInput(tx, actor.organizationId, input.mentorId, offering, now);
    if (!isFreeSlot(startsAt, slots)) throw errors.conflict(M.slotTaken);
    const pkg = await packageDTO(
      tx,
      actor.organizationId,
      actor.userId,
      input.templateId,
      input.mentorId,
      now,
      slots.timeZone,
    );
    const usable = pkg && (pkg.bookable === null || pkg.bookable > 0) ? pkg : null;
    const requestId = await repo.insertRequest(tx, {
      organizationId: actor.organizationId,
      mentorId: input.mentorId,
      studentId: actor.userId,
      templateId: input.templateId,
      enrollmentId: usable?.enrollmentId ?? null,
      scheduledAt: startsAt,
      durationMinutes: offering.sessionMinutes,
      holdUntil: new Date(Math.min(now.getTime() + HOLD_MS, startsAt.getTime())),
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    });
    // Without a package the admins enroll the mentee first; they hear about it too.
    const admins = usable ? [] : await repo.listAdmins(tx, actor.organizationId);
    await notify(
      tx,
      actor,
      [input.mentorId, ...admins].map((userId) => ({
        userId,
        kind: 'booking_requested' as const,
        studentId: actor.userId,
        subjectId: requestId,
        data: { at: startsAt.toISOString(), title: offering.title },
      })),
      now,
    );
    return requestId;
  });
  return bookingDTO(db, actor, id, now);
}

function toBookingDTO(actor: Actor, r: repo.BookingRow, now: Date): BookingDTO {
  const expired = isExpired(r, now);
  const decides = (actor.role === 'admin' || r.mentorId === actor.userId) && r.status === 'pending';
  const own = actor.role === 'student' && r.studentId === actor.userId;
  const beforeNotice =
    r.scheduledAt.getTime() - now.getTime() >= (r.cancelNoticeHours ?? 24) * 3_600_000;
  return {
    id: r.id,
    mentor: { id: r.mentorId, displayName: r.mentorName },
    student: { id: r.studentId, displayName: r.studentName },
    template: { id: r.templateId, title: r.templateTitle },
    scheduledAt: r.scheduledAt.toISOString(),
    endsAt: new Date(r.scheduledAt.getTime() + r.durationMinutes * 60_000).toISOString(),
    durationMinutes: r.durationMinutes,
    status: expired ? 'expired' : r.status,
    holdUntil: r.holdUntil.toISOString(),
    note: r.note,
    hasPackage: r.enrollmentId !== null,
    sessionId: r.sessionId,
    declineReason: r.declineReason,
    createdAt: r.createdAt.toISOString(),
    can: {
      approve: decides && !expired,
      decline: decides && !expired,
      cancel:
        own &&
        ((r.status === 'pending' && !expired) ||
          (r.status === 'approved' && r.sessionStatus === 'scheduled' && beforeNotice)),
    },
  };
}

function visibleTo(actor: Actor): SQL | undefined {
  if (actor.role === 'student') return eq(bookingRequests.studentId, actor.userId);
  if (actor.role === 'mentor') return eq(bookingRequests.mentorId, actor.userId);
  return undefined;
}

async function bookingDTO(db: DbOrTx, actor: Actor, id: string, now: Date): Promise<BookingDTO> {
  const [row] = await repo.listRequests(
    db,
    actor.organizationId,
    and(eq(bookingRequests.id, id), visibleTo(actor)),
    'asc',
  );
  if (!row) throw errors.notFound();
  return toBookingDTO(actor, row, now);
}

/**
 * GET /booking-requests. `open` (default for staff): pending and still held, soonest first;
 * a mentee gets all of theirs, newest first.
 */
export async function listBookings(
  actor: Actor,
  query: BookingListQuery = {},
  now: Date = new Date(),
  db: DbOrTx = getDb(),
): Promise<BookingDTO[]> {
  const status = query.status ?? (actor.role === 'student' ? undefined : 'open');
  const parts: SQL[] = [];
  const own = visibleTo(actor);
  if (own) parts.push(own);
  if (query.mentorId && actor.role === 'admin') {
    parts.push(eq(bookingRequests.mentorId, query.mentorId));
  }
  if (status === 'open') {
    parts.push(eq(bookingRequests.status, 'pending'), gt(bookingRequests.holdUntil, now));
  } else if (status) {
    parts.push(eq(bookingRequests.status, status));
  }
  const rows = await repo.listRequests(
    db,
    actor.organizationId,
    parts.length ? and(...parts) : undefined,
    status === 'open' ? 'asc' : 'desc',
  );
  return rows.map((r) => toBookingDTO(actor, r, now));
}

/** Pending, still-held requests waiting for this mentor (the badge of their calendar). */
export async function openBookingCount(actor: Actor, db: DbOrTx = getDb()): Promise<number> {
  if (actor.role === 'student') return 0;
  const parts = [
    eq(bookingRequests.organizationId, actor.organizationId),
    eq(bookingRequests.status, 'pending'),
    gt(bookingRequests.holdUntil, new Date()),
  ];
  if (actor.role === 'mentor') parts.push(eq(bookingRequests.mentorId, actor.userId));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookingRequests)
    .where(and(...parts));
  return row?.n ?? 0;
}

async function lockForDecision(tx: DbOrTx, actor: Actor, id: string, now: Date) {
  assertStaff(actor);
  const row = await repo.lockRequest(tx, actor.organizationId, id);
  if (!row || (actor.role === 'mentor' && row.mentorId !== actor.userId)) {
    throw errors.notFound();
  }
  if (row.status !== 'pending') throw errors.conflict(M.notPending);
  if (isExpired(row, now)) throw errors.conflict(M.expired);
  return row;
}

/** POST /booking-requests/:id/approve (the request's mentor, A): the session is booked. */
export async function approveBooking(
  actor: Actor,
  id: string,
  now: Date = new Date(),
  db: Db = getDb(),
): Promise<BookingDTO> {
  await db.transaction(async (tx) => {
    const peek = await repo.lockRequest(tx, actor.organizationId, id);
    if (peek) await lockMentor(tx, peek.mentorId);
    const row = await lockForDecision(tx, actor, id, now);
    const timeZone = await organizationTimeZone(tx, actor.organizationId);
    // The package may have come after the request (the admin enrolled the mentee).
    const pkg = await packageDTO(
      tx,
      actor.organizationId,
      row.studentId,
      row.templateId,
      row.mentorId,
      now,
      timeZone,
    );
    if (!pkg) throw errors.conflict(M.needsPackage);
    // This request itself is counted as held in `bookable` when it already had the package.
    const free = (pkg.bookable ?? 1) + (row.enrollmentId === pkg.enrollmentId ? 1 : 0);
    if (free <= 0) throw errors.conflict(M.noSessionsLeft);
    const busy = await repo.busyOf(tx, actor.organizationId, row.mentorId, now, now, row.id);
    const end = row.scheduledAt.getTime() + row.durationMinutes * 60_000;
    if (busy.some((b) => row.scheduledAt.getTime() < b.end.getTime() && end > b.start.getTime())) {
      throw errors.conflict(M.slotTaken);
    }
    const [offering] = await repo.listOfferings(tx, actor.organizationId, [row.mentorId], {
      activeOnly: false,
      templateId: row.templateId,
    });
    const sessionId = await insertBookedSession(
      tx,
      actor,
      {
        enrollmentId: pkg.enrollmentId,
        mentorId: row.mentorId,
        scheduledAt: row.scheduledAt,
        durationMinutes: row.durationMinutes,
        location: offering?.location ?? null,
      },
      now,
    );
    await repo.updateRequest(tx, row.id, {
      status: 'approved',
      enrollmentId: pkg.enrollmentId,
      sessionId,
      decidedBy: actor.userId,
      decidedAt: now,
      updatedAt: now,
    });
    await notify(
      tx,
      actor,
      [
        {
          userId: row.studentId,
          kind: 'booking_decided',
          studentId: row.studentId,
          subjectId: row.id,
          data: { at: row.scheduledAt.toISOString(), outcome: 'approved' },
        },
      ],
      now,
    );
  });
  return bookingDTO(db, actor, id, now);
}

/** POST /booking-requests/:id/decline (the request's mentor, A): the slot is free again. */
export async function declineBooking(
  actor: Actor,
  id: string,
  reason: string | null,
  now: Date = new Date(),
  db: Db = getDb(),
): Promise<BookingDTO> {
  await db.transaction(async (tx) => {
    const row = await lockForDecision(tx, actor, id, now);
    await repo.updateRequest(tx, row.id, {
      status: 'declined',
      declineReason: reason,
      decidedBy: actor.userId,
      decidedAt: now,
      updatedAt: now,
    });
    await notify(
      tx,
      actor,
      [
        {
          userId: row.studentId,
          kind: 'booking_decided',
          studentId: row.studentId,
          subjectId: row.id,
          data: { at: row.scheduledAt.toISOString(), outcome: 'declined' },
        },
      ],
      now,
    );
  });
  return bookingDTO(db, actor, id, now);
}

/**
 * POST /booking-requests/:id/cancel (S, own): a pending request, or a booked session until
 * the offering's cancellation notice; later only the mentor cancels (and decides whether the
 * session still counts toward the package).
 */
export async function cancelBooking(
  actor: Actor,
  id: string,
  now: Date = new Date(),
  db: Db = getDb(),
): Promise<BookingDTO> {
  if (actor.role !== 'student') throw errors.forbidden();
  await db.transaction(async (tx) => {
    const row = await repo.lockRequest(tx, actor.organizationId, id);
    if (!row || row.studentId !== actor.userId) throw errors.notFound();
    const [dto] = await repo.listRequests(
      tx,
      actor.organizationId,
      eq(bookingRequests.id, id),
      'asc',
    );
    if (!dto || !toBookingDTO(actor, dto, now).can.cancel) {
      if (row.status !== 'approved') throw errors.conflict(M.notPending);
      const hours = dto?.cancelNoticeHours ?? 24;
      throw new ApiError('CONFLICT', {
        message: translate('fa', 'schedulingErrors.cancelTooLate', {
          hours: formatCount('fa', hours),
        }),
        messageKey: { key: 'schedulingErrors.cancelTooLate', params: { hours } },
      });
    }
    if (row.status === 'approved' && row.sessionId) {
      await cancelBookedSession(tx, row.sessionId, M.cancelledByStudent, now);
    }
    await repo.updateRequest(tx, row.id, { status: 'cancelled', updatedAt: now });
    await notify(
      tx,
      actor,
      [
        {
          userId: row.mentorId,
          kind: 'booking_cancelled',
          studentId: actor.userId,
          subjectId: row.id,
          data: { at: row.scheduledAt.toISOString() },
        },
      ],
      now,
    );
  });
  return bookingDTO(db, actor, id, now);
}
