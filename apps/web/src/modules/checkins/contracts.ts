import { z } from 'zod';
import { cursorInput, intInput, limitInput, longText } from '@/server/http/schemas';

/**
 * checkins — weekly check-in (progress-tracking.md 6-3, api.md section 11). Every route
 * answers 404 while `settings.checkin.enabled` is false. One check-in per Tehran week
 * (Saturday start); the form is «open» from the configured weekday to the end of Friday.
 */

/** POST /me/checkins (S). `needsHelp: true` opens a question in the mentor's queue. */
export const createCheckinInput = z.strictObject({
  activityText: longText(2000).nullable().optional(),
  blocker: longText(1000).nullable().optional(),
  mood: intInput(1, 5),
  nextWeekPlan: longText(1000).nullable().optional(),
  needsHelp: z.boolean(),
});
export type CreateCheckinInput = z.infer<typeof createCheckinInput>;

/** GET /students/:id/checkins (A, M in scope). Newest week first. */
export const listCheckinsQuery = z.strictObject({
  limit: limitInput.optional(),
  cursor: cursorInput.optional(),
});
export type ListCheckinsQuery = z.infer<typeof listCheckinsQuery>;

/** The same shape for the student (own) and staff; only the student's own answers. */
export type CheckinDTO = {
  id: string;
  /** Saturday `YYYY-MM-DD` (Tehran) of the week. */
  weekStart: string;
  activityText: string | null;
  blocker: string | null;
  mood: number;
  nextWeekPlan: string | null;
  needsHelp: boolean;
  /** Thread opened by «needs help» (student: GET /questions/:id). */
  questionId: string | null;
  submittedAt: string;
};

export type CheckinListDTO = { items: CheckinDTO[]; nextCursor: string | null };

/** GET /me/checkins/current (S). */
export type CurrentCheckinDTO = {
  weekStart: string;
  /** Inside the window (configured weekday … end of Friday). Sending is allowed any time. */
  open: boolean;
  /** When the window of this week opens (ISO). */
  opensAt: string;
  existing: CheckinDTO | null;
  /** «این هفته چه کردی؟» numbers since Saturday. */
  weekSummary: { tasksSubmitted: number; tasksAccepted: number };
};
