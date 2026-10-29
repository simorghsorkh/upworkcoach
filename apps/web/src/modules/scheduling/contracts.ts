import { z } from 'zod';
import { messagesFor } from '@/i18n/messages';
import { dayInput, intInput, isoInstantInput, longText, uuidInput } from '@/server/http/schemas';
import { locationInput, timeInput } from '../mentoring/contracts';
import type { PackageUsageDTO } from '../programs/contracts';
import { BOOKING_STATUSES, type BookingStatus, WEEKDAYS } from './schema';

/**
 * scheduling — API contracts of bookable hours and booking requests (Coach Office sprint 7,
 * ADR-0014). Times of day are `HH:MM` wall clock in the organization's zone; a slot is sent
 * and received as the ISO instant the slots endpoint returned. Inputs are strict (SEC-A7).
 */

const M = messagesFor('fa').schedulingErrors;

const minutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
/** `24:00` closes a window at midnight. */
const endTimeInput = z.union([timeInput, z.literal('24:00')]);

const ruleInput = z
  .strictObject({
    weekday: z.enum(WEEKDAYS),
    start: timeInput,
    end: endTimeInput,
    /** Empty or omitted = every offering of the mentor. */
    templateIds: z.array(uuidInput).max(20).optional(),
  })
  .refine((r) => minutes(r.start) < minutes(r.end), { message: M.badRange, path: ['end'] });

const windowInput = z
  .strictObject({
    start: timeInput,
    end: endTimeInput,
    /** Empty or omitted = every offering of the mentor. */
    templateIds: z.array(uuidInput).max(20).optional(),
  })
  .refine((w) => minutes(w.start) < minutes(w.end), { message: M.badRange, path: ['end'] });

/** The hours of one date (sprint 7b); they replace the weekly hours of that date. */
const dateInput = z.strictObject({
  day: dayInput,
  /** Empty = not available that date. */
  windows: z.array(windowInput).max(12),
});

/**
 * PUT /mentors/:id/availability (A; M for themselves): replaces the weekly hours and every
 * date with hours of its own.
 */
export const availabilityInput = z.strictObject({
  rules: z.array(ruleInput).max(60),
  dates: z
    .array(dateInput)
    .max(400)
    .refine((ds) => new Set(ds.map((d) => d.day)).size === ds.length, {
      message: M.duplicateDay,
    }),
});
export type AvailabilityInput = z.infer<typeof availabilityInput>;

/** PUT /mentors/:id/offerings/:templateId (A; M for themselves). Omitted fields stay. */
export const offeringInput = z.strictObject({
  active: z.boolean().optional(),
  bufferMinutes: intInput(0, 240).optional(),
  minNoticeHours: intInput(0, 336).optional(),
  horizonDays: intInput(1, 180).optional(),
  cancelNoticeHours: intInput(0, 336).optional(),
  /** null or '' clears it. */
  location: locationInput.nullable().optional(),
});
export type OfferingInput = z.infer<typeof offeringInput>;

/** GET /mentors/:id/slots?templateId= (A, M, S). */
export const slotsQuery = z.strictObject({ templateId: uuidInput });

/** POST /booking-requests (S): a slot as returned by the slots endpoint. */
export const createBookingInput = z.strictObject({
  mentorId: uuidInput,
  templateId: uuidInput,
  startsAt: isoInstantInput,
  note: longText(500).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingInput>;

/** GET /booking-requests: the caller's own (S), their bookings (M) or all (A). */
export const bookingListQuery = z.strictObject({
  status: z.enum([...BOOKING_STATUSES, 'open'] as const).optional(),
  mentorId: uuidInput.optional(),
});
export type BookingListQuery = z.infer<typeof bookingListQuery>;

/** POST /booking-requests/:id/decline (M of the request, A). */
export const declineBookingInput = z.strictObject({ reason: longText(300).optional() });

// ---- DTOs ---------------------------------------------------------------------------------

export type RuleDTO = {
  weekday: (typeof WEEKDAYS)[number];
  start: string;
  end: string;
  templateIds: string[];
};
export type WindowDTO = { start: string; end: string; templateIds: string[] };
/** A date with hours of its own; no windows = not available that date. */
export type DateHoursDTO = { day: string; windows: WindowDTO[] };

export type OfferingDTO = {
  templateId: string;
  title: string;
  description: string | null;
  sessionMinutes: number;
  sessionQuota: number | null;
  validityDays: number | null;
  active: boolean;
  bufferMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
  cancelNoticeHours: number;
  location: string | null;
};

/** GET /mentors/:id/availability (A; M for themselves). */
export type AvailabilityDTO = {
  mentor: { id: string; displayName: string };
  timeZone: string;
  rules: RuleDTO[];
  /** Dates with hours of their own, today and later only. */
  dates: DateHoursDTO[];
  /** Saved offerings, then the one-on-one templates the mentor could still offer (inactive). */
  offerings: OfferingDTO[];
};

/** The mentee's package for an offering, when they hold one with this mentor. */
export type BookingPackageDTO = {
  enrollmentId: string;
  usage: PackageUsageDTO;
  /** Sessions still bookable: remaining − upcoming sessions − held requests (null = no limit). */
  bookable: number | null;
};

/** GET /booking/mentors (S): mentors taking bookings, with their active offerings. */
export type BookableMentorDTO = {
  id: string;
  displayName: string;
  specialties: string[];
  bio: string | null;
  offerings: Array<OfferingDTO & { package: BookingPackageDTO | null }>;
};

export type SlotDayDTO = { day: string; slots: string[] };

/** GET /mentors/:id/slots. */
export type SlotsDTO = {
  timeZone: string;
  durationMinutes: number;
  days: SlotDayDTO[];
};

export type BookingDTO = {
  id: string;
  mentor: { id: string; displayName: string };
  student: { id: string; displayName: string };
  template: { id: string; title: string };
  scheduledAt: string;
  endsAt: string;
  durationMinutes: number;
  /** `pending` past its hold is reported as `expired`. */
  status: BookingStatus | 'expired';
  holdUntil: string;
  note: string | null;
  hasPackage: boolean;
  sessionId: string | null;
  declineReason: string | null;
  createdAt: string;
  can: { approve: boolean; decline: boolean; cancel: boolean };
};
