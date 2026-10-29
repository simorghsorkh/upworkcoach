import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Weekday } from '../../lib/org-day';
import { uuidv7 } from '../../lib/uuid';
import { organizationId, users } from '../identity/schema';
import { mentoringSessions } from '../mentoring/schema';
import { enrollments, programTemplates } from '../programs/schema';

/**
 * scheduling — a mentor's bookable hours and mentees' booking requests (Coach Office sprint 7,
 * ADR-0014, docs/08-saas-evolution/booking-design.md).
 *
 *   availability_rules       optional weekly hours, wall clock in the organization's zone
 *   availability_exceptions  hours set for one date (sprint 7b): the date's rows replace the
 *                            weekly hours of that date; a single `off` row = not available
 *   mentor_offerings         which one-on-one templates a mentor takes bookings for, and how
 *   booking_requests         a mentee's request; the mentor's approval makes a session
 *
 * Free slots are never stored: they are computed from these rows and the mentor's sessions.
 * Relative imports only (drizzle-kit).
 */

export const WEEKDAYS = [
  'sat',
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
] as const satisfies readonly Weekday[];

export const EXCEPTION_KINDS = ['off', 'hours'] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

/** `pending` past `hold_until` is shown as expired and no longer holds the slot. */
export const BOOKING_STATUSES = ['pending', 'approved', 'declined', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const ts = () => timestamp({ withTimezone: true });
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));
const minuteOfDay = () => integer();

export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    mentorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekday: text({ enum: WEEKDAYS }).notNull(),
    /** Minutes after midnight, `[start, end)`. */
    startMinute: minuteOfDay().notNull(),
    endMinute: minuteOfDay().notNull(),
    /** Templates bookable in this window; empty = every offering of the mentor. */
    templateIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('availability_rules_mentor_idx').on(t.organizationId, t.mentorId),
    check('availability_rules_weekday_check', sql`${t.weekday} IN (${inList(WEEKDAYS)})`),
    check(
      'availability_rules_range_check',
      sql`${t.startMinute} >= 0 AND ${t.startMinute} < ${t.endMinute} AND ${t.endMinute} <= 1440`,
    ),
  ],
);

export const availabilityExceptions = pgTable(
  'availability_exceptions',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    mentorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    kind: text({ enum: EXCEPTION_KINDS }).notNull(),
    /** `off` = the whole date (no range); `hours` = one bookable window of that date. */
    startMinute: minuteOfDay(),
    endMinute: minuteOfDay(),
    /** Templates bookable in an `hours` window; empty = every offering of the mentor. */
    templateIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('availability_exceptions_mentor_idx').on(t.organizationId, t.mentorId, t.day),
    check('availability_exceptions_kind_check', sql`${t.kind} IN (${inList(EXCEPTION_KINDS)})`),
    check(
      'availability_exceptions_range_check',
      sql`(${t.kind} = 'off' AND ${t.startMinute} IS NULL AND ${t.endMinute} IS NULL) OR (${t.kind} = 'hours' AND ${t.startMinute} >= 0 AND ${t.startMinute} < ${t.endMinute} AND ${t.endMinute} <= 1440)`,
    ),
  ],
);

export const mentorOfferings = pgTable(
  'mentor_offerings',
  {
    organizationId: organizationId(),
    mentorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** A one-on-one template; its `session_minutes` is the length of a booked session. */
    templateId: uuid()
      .notNull()
      .references(() => programTemplates.id, { onDelete: 'cascade' }),
    active: boolean().notNull().default(true),
    /** Free time kept after each session (and before the next one). */
    bufferMinutes: integer().notNull().default(15),
    /** A slot must start at least this far from now. */
    minNoticeHours: integer().notNull().default(12),
    /** Slots are offered up to this many days ahead (mentors plan month by month). */
    horizonDays: integer().notNull().default(60),
    /** The mentee may cancel a request or a session up to this long before it starts. */
    cancelNoticeHours: integer().notNull().default(24),
    /** Default meeting link or place for booked sessions. */
    location: text(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.mentorId, t.templateId] }),
    index('mentor_offerings_org_idx').on(t.organizationId, t.mentorId),
    check(
      'mentor_offerings_limits_check',
      sql`${t.bufferMinutes} BETWEEN 0 AND 240 AND ${t.minNoticeHours} BETWEEN 0 AND 336 AND ${t.horizonDays} BETWEEN 1 AND 180 AND ${t.cancelNoticeHours} BETWEEN 0 AND 336`,
    ),
  ],
);

export const bookingRequests = pgTable(
  'booking_requests',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: organizationId(),
    mentorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: uuid()
      .notNull()
      .references(() => programTemplates.id, { onDelete: 'cascade' }),
    /** The package it uses; null = the mentee had none (the admin enrolls them first). */
    enrollmentId: uuid().references(() => enrollments.id, { onDelete: 'set null' }),
    scheduledAt: ts().notNull(),
    durationMinutes: integer().notNull(),
    status: text({ enum: BOOKING_STATUSES }).notNull().default('pending'),
    /** A pending request holds its slot until then (48 hours at most, never past its start). */
    holdUntil: ts().notNull(),
    /** The mentee's note to the mentor. */
    note: text(),
    /** Set on approval. */
    sessionId: uuid().references(() => mentoringSessions.id, { onDelete: 'set null' }),
    decidedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    decidedAt: ts(),
    declineReason: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index('booking_requests_mentor_idx')
      .on(t.organizationId, t.mentorId, t.scheduledAt)
      .where(sql`${t.status} = 'pending'`),
    index('booking_requests_student_idx').on(t.studentId, t.createdAt),
    check('booking_requests_status_check', sql`${t.status} IN (${inList(BOOKING_STATUSES)})`),
    check(
      'booking_requests_duration_check',
      sql`${t.durationMinutes} > 0 AND ${t.durationMinutes} <= 600`,
    ),
  ],
);
