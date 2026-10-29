import { and, asc, desc, eq, gt, inArray, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '@/server/db';
import { organizationMemberships, users } from '../identity/schema';
import { mentoringSessions } from '../mentoring/schema';
import { mentorProfiles } from '../mentors/schema';
import {
  enrollmentMentors,
  enrollments,
  programRuns,
  programTemplates,
  runStaff,
} from '../programs/schema';
import {
  availabilityExceptions,
  availabilityRules,
  bookingRequests,
  mentorOfferings,
} from './schema';

/**
 * scheduling — data access. Writes only this module's tables; reads users, memberships,
 * mentor profiles, templates, runs, enrollments and sessions (read-only, module rule).
 */

// ---- hours -----------------------------------------------------------------------------

export async function listRules(db: DbOrTx, org: string, mentorId: string) {
  return db
    .select({
      weekday: availabilityRules.weekday,
      startMinute: availabilityRules.startMinute,
      endMinute: availabilityRules.endMinute,
      templateIds: availabilityRules.templateIds,
    })
    .from(availabilityRules)
    .where(and(eq(availabilityRules.organizationId, org), eq(availabilityRules.mentorId, mentorId)))
    .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startMinute));
}

export async function listExceptions(db: DbOrTx, org: string, mentorId: string, fromDay: string) {
  return db
    .select({
      day: availabilityExceptions.day,
      kind: availabilityExceptions.kind,
      startMinute: availabilityExceptions.startMinute,
      endMinute: availabilityExceptions.endMinute,
      templateIds: availabilityExceptions.templateIds,
    })
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.organizationId, org),
        eq(availabilityExceptions.mentorId, mentorId),
        sql`${availabilityExceptions.day} >= ${fromDay}::date`,
      ),
    )
    .orderBy(asc(availabilityExceptions.day), asc(availabilityExceptions.startMinute));
}

/** One row of a date's own hours (sprint 7b). */
export type DateRow = {
  day: string;
  kind: 'off' | 'hours';
  startMinute: number | null;
  endMinute: number | null;
  templateIds: string[];
};

export async function replaceHours(
  db: DbOrTx,
  org: string,
  mentorId: string,
  rules: Array<{
    weekday: (typeof availabilityRules.$inferInsert)['weekday'];
    startMinute: number;
    endMinute: number;
    templateIds: string[];
  }>,
  exceptions: DateRow[],
): Promise<void> {
  const own = (t: typeof availabilityRules | typeof availabilityExceptions) =>
    and(eq(t.organizationId, org), eq(t.mentorId, mentorId));
  await db.delete(availabilityRules).where(own(availabilityRules));
  await db.delete(availabilityExceptions).where(own(availabilityExceptions));
  if (rules.length) {
    await db
      .insert(availabilityRules)
      .values(rules.map((r) => ({ ...r, organizationId: org, mentorId })));
  }
  if (exceptions.length) {
    await db
      .insert(availabilityExceptions)
      .values(exceptions.map((e) => ({ ...e, organizationId: org, mentorId })));
  }
}

// ---- offerings ---------------------------------------------------------------------------

const offeringColumns = {
  templateId: programTemplates.id,
  title: programTemplates.title,
  description: programTemplates.description,
  sessionMinutes: programTemplates.sessionMinutes,
  sessionQuota: programTemplates.sessionQuota,
  validityDays: programTemplates.validityDays,
  active: mentorOfferings.active,
  bufferMinutes: mentorOfferings.bufferMinutes,
  minNoticeHours: mentorOfferings.minNoticeHours,
  horizonDays: mentorOfferings.horizonDays,
  cancelNoticeHours: mentorOfferings.cancelNoticeHours,
  location: mentorOfferings.location,
  mentorId: mentorOfferings.mentorId,
};
export type OfferingRow = {
  templateId: string;
  title: string;
  description: string | null;
  sessionMinutes: number | null;
  sessionQuota: number | null;
  validityDays: number | null;
  active: boolean | null;
  bufferMinutes: number | null;
  minNoticeHours: number | null;
  horizonDays: number | null;
  cancelNoticeHours: number | null;
  location: string | null;
  mentorId: string | null;
};

/**
 * One-on-one templates a mentor may take bookings for: published, and shared with the
 * organization or their own. Joined with the mentor's saved offering (null columns = none).
 */
export async function listOfferings(
  db: DbOrTx,
  org: string,
  mentorIds: readonly string[],
  opts: { activeOnly: boolean; templateId?: string },
): Promise<OfferingRow[]> {
  if (!mentorIds.length) return [];
  if (opts.activeOnly) {
    return db
      .select(offeringColumns)
      .from(mentorOfferings)
      .innerJoin(programTemplates, eq(programTemplates.id, mentorOfferings.templateId))
      .where(
        and(
          eq(mentorOfferings.organizationId, org),
          inArray(mentorOfferings.mentorId, [...mentorIds]),
          eq(mentorOfferings.active, true),
          eq(programTemplates.kind, 'one_on_one'),
          eq(programTemplates.status, 'published'),
          or(
            eq(programTemplates.visibility, 'organization'),
            eq(programTemplates.ownerId, mentorOfferings.mentorId),
          ),
          opts.templateId ? eq(programTemplates.id, opts.templateId) : undefined,
        ),
      )
      .orderBy(asc(programTemplates.title));
  }
  const [mentorId] = mentorIds;
  return db
    .select(offeringColumns)
    .from(programTemplates)
    .leftJoin(
      mentorOfferings,
      and(
        eq(mentorOfferings.templateId, programTemplates.id),
        eq(mentorOfferings.mentorId, mentorId as string),
      ),
    )
    .where(
      and(
        eq(programTemplates.organizationId, org),
        eq(programTemplates.kind, 'one_on_one'),
        eq(programTemplates.status, 'published'),
        or(
          eq(programTemplates.visibility, 'organization'),
          eq(programTemplates.ownerId, mentorId as string),
        ),
        opts.templateId ? eq(programTemplates.id, opts.templateId) : undefined,
      ),
    )
    .orderBy(asc(programTemplates.title));
}

export async function upsertOffering(
  db: DbOrTx,
  values: typeof mentorOfferings.$inferInsert,
): Promise<void> {
  const { organizationId: _o, mentorId: _m, templateId: _t, ...rest } = values;
  await db
    .insert(mentorOfferings)
    .values(values)
    .onConflictDoUpdate({
      target: [mentorOfferings.mentorId, mentorOfferings.templateId],
      set: rest,
    });
}

// ---- people ------------------------------------------------------------------------------

/** Active staff of the organization with their directory card (accepting = true if none). */
export async function listStaff(db: DbOrTx, org: string, userIds?: readonly string[]) {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      specialties: mentorProfiles.specialties,
      bio: mentorProfiles.bio,
      accepting: sql<boolean>`coalesce(${mentorProfiles.acceptingStudents}, true)`,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .leftJoin(
      mentorProfiles,
      and(eq(mentorProfiles.organizationId, org), eq(mentorProfiles.userId, users.id)),
    )
    .where(
      and(
        eq(organizationMemberships.organizationId, org),
        eq(organizationMemberships.status, 'active'),
        inArray(organizationMemberships.role, ['owner', 'admin', 'mentor']),
        eq(users.status, 'active'),
        userIds ? inArray(users.id, [...userIds]) : undefined,
      ),
    )
    .orderBy(asc(users.displayName));
}

/** Active admins and owners (they enroll a mentee who has no package). */
export async function listAdmins(db: DbOrTx, org: string): Promise<string[]> {
  const rows = await db
    .select({ id: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, org),
        eq(organizationMemberships.status, 'active'),
        inArray(organizationMemberships.role, ['owner', 'admin']),
      ),
    );
  return rows.map((r) => r.id);
}

// ---- busy time and packages ----------------------------------------------------------------

/** A mentor's scheduled sessions and held requests that end after `from`. */
export async function busyOf(
  db: DbOrTx,
  org: string,
  mentorId: string,
  from: Date,
  now: Date,
  exceptRequestId: string | null = null,
): Promise<Array<{ start: Date; end: Date }>> {
  const [sessions, requests] = await Promise.all([
    db
      .select({ start: mentoringSessions.scheduledAt, minutes: mentoringSessions.durationMinutes })
      .from(mentoringSessions)
      .where(
        and(
          eq(mentoringSessions.organizationId, org),
          eq(mentoringSessions.mentorId, mentorId),
          inArray(mentoringSessions.status, ['scheduled', 'held']),
          sql`${mentoringSessions.scheduledAt} + make_interval(mins => ${mentoringSessions.durationMinutes}) > ${from.toISOString()}::timestamptz`,
        ),
      ),
    db
      .select({ start: bookingRequests.scheduledAt, minutes: bookingRequests.durationMinutes })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.organizationId, org),
          eq(bookingRequests.mentorId, mentorId),
          eq(bookingRequests.status, 'pending'),
          gt(bookingRequests.holdUntil, now),
          exceptRequestId ? sql`${bookingRequests.id} <> ${exceptRequestId}` : undefined,
        ),
      ),
  ]);
  return [...sessions, ...requests].map((r) => ({
    start: r.start,
    end: new Date(r.start.getTime() + r.minutes * 60_000),
  }));
}

/**
 * The mentee's newest active enrollment in an open one-on-one run of the template where the
 * mentor is run staff or one of the enrollment's mentors, with what it has used and reserved.
 */
export async function packageOf(
  db: DbOrTx,
  org: string,
  studentId: string,
  templateId: string,
  mentorId: string,
  now: Date,
) {
  const [row] = await db
    .select({
      id: enrollments.id,
      runId: enrollments.runId,
      sessionQuota: enrollments.sessionQuota,
      validUntil: enrollments.validUntil,
    })
    .from(enrollments)
    .innerJoin(programRuns, eq(programRuns.id, enrollments.runId))
    .where(
      and(
        eq(enrollments.organizationId, org),
        eq(enrollments.studentId, studentId),
        eq(enrollments.status, 'active'),
        eq(programRuns.templateId, templateId),
        eq(programRuns.kind, 'one_on_one'),
        inArray(programRuns.status, ['draft', 'active']),
        or(
          sql`EXISTS (SELECT 1 FROM ${runStaff} WHERE ${runStaff.runId} = ${programRuns.id} AND ${runStaff.userId} = ${mentorId} AND ${runStaff.endedAt} IS NULL)`,
          sql`EXISTS (SELECT 1 FROM ${enrollmentMentors} WHERE ${enrollmentMentors.enrollmentId} = ${enrollments.id} AND ${enrollmentMentors.userId} = ${mentorId} AND ${enrollmentMentors.endedAt} IS NULL)`,
        ),
      ),
    )
    .orderBy(desc(enrollments.enrolledAt))
    .limit(1);
  if (!row) return null;
  const [sessions, [held]] = await Promise.all([
    db
      .select({
        enrollmentId: mentoringSessions.enrollmentId,
        status: mentoringSessions.status,
        countsTowardQuota: mentoringSessions.countsTowardQuota,
        scheduledAt: mentoringSessions.scheduledAt,
      })
      .from(mentoringSessions)
      .where(eq(mentoringSessions.enrollmentId, row.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.enrollmentId, row.id),
          eq(bookingRequests.status, 'pending'),
          gt(bookingRequests.holdUntil, now),
        ),
      ),
  ]);
  return {
    ...row,
    sessions: sessions.map((s) => ({
      enrollmentId: s.enrollmentId as string,
      status: s.status,
      countsTowardQuota: s.countsTowardQuota,
    })),
    upcoming: sessions.filter((s) => s.status === 'scheduled').length,
    heldRequests: held?.n ?? 0,
  };
}

// ---- requests ------------------------------------------------------------------------------

export async function insertRequest(
  db: DbOrTx,
  values: typeof bookingRequests.$inferInsert,
): Promise<string> {
  const [row] = await db
    .insert(bookingRequests)
    .values(values)
    .returning({ id: bookingRequests.id });
  return (row as { id: string }).id;
}

export async function updateRequest(
  db: DbOrTx,
  id: string,
  values: Partial<typeof bookingRequests.$inferInsert>,
): Promise<void> {
  await db.update(bookingRequests).set(values).where(eq(bookingRequests.id, id));
}

export async function lockRequest(db: DbOrTx, org: string, id: string) {
  const [row] = await db
    .select()
    .from(bookingRequests)
    .where(and(eq(bookingRequests.organizationId, org), eq(bookingRequests.id, id)))
    .for('update');
  return row ?? null;
}

/** Live requests of a mentee (pending and still held), for the per-mentee limit. */
export async function countLiveRequests(db: DbOrTx, studentId: string, now: Date) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.studentId, studentId),
        eq(bookingRequests.status, 'pending'),
        gt(bookingRequests.holdUntil, now),
      ),
    );
  return row?.n ?? 0;
}

const mentorUser = alias(users, 'booking_mentor');
const studentUser = alias(users, 'booking_student');

export type BookingRow = Awaited<ReturnType<typeof listRequests>>[number];

export async function listRequests(
  db: DbOrTx,
  org: string,
  where: SQL | undefined,
  order: 'asc' | 'desc',
) {
  return db
    .select({
      id: bookingRequests.id,
      mentorId: bookingRequests.mentorId,
      mentorName: mentorUser.displayName,
      studentId: bookingRequests.studentId,
      studentName: studentUser.displayName,
      templateId: bookingRequests.templateId,
      templateTitle: programTemplates.title,
      enrollmentId: bookingRequests.enrollmentId,
      scheduledAt: bookingRequests.scheduledAt,
      durationMinutes: bookingRequests.durationMinutes,
      status: bookingRequests.status,
      holdUntil: bookingRequests.holdUntil,
      note: bookingRequests.note,
      sessionId: bookingRequests.sessionId,
      sessionStatus: mentoringSessions.status,
      declineReason: bookingRequests.declineReason,
      createdAt: bookingRequests.createdAt,
      cancelNoticeHours: mentorOfferings.cancelNoticeHours,
    })
    .from(bookingRequests)
    .innerJoin(mentorUser, eq(mentorUser.id, bookingRequests.mentorId))
    .innerJoin(studentUser, eq(studentUser.id, bookingRequests.studentId))
    .innerJoin(programTemplates, eq(programTemplates.id, bookingRequests.templateId))
    .leftJoin(mentoringSessions, eq(mentoringSessions.id, bookingRequests.sessionId))
    .leftJoin(
      mentorOfferings,
      and(
        eq(mentorOfferings.mentorId, bookingRequests.mentorId),
        eq(mentorOfferings.templateId, bookingRequests.templateId),
      ),
    )
    .where(and(eq(bookingRequests.organizationId, org), where))
    .orderBy(order === 'asc' ? asc(bookingRequests.scheduledAt) : desc(bookingRequests.scheduledAt))
    .limit(200);
}

/** Account erasure (ADR-0010): a mentor's hours, offerings and requests go with them. */
export async function eraseSchedulingOf(db: DbOrTx, userId: string): Promise<void> {
  await db
    .delete(bookingRequests)
    .where(or(eq(bookingRequests.studentId, userId), eq(bookingRequests.mentorId, userId)));
  await db.delete(availabilityRules).where(eq(availabilityRules.mentorId, userId));
  await db.delete(availabilityExceptions).where(eq(availabilityExceptions.mentorId, userId));
  await db.delete(mentorOfferings).where(eq(mentorOfferings.mentorId, userId));
}
