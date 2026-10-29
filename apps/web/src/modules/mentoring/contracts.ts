import { z } from 'zod';
import { messagesFor } from '@/i18n/messages';
import {
  dayInput,
  HTTPS_URL_MESSAGE,
  intInput,
  longText,
  requiredShortText,
  shortText,
  uuidInput,
} from '@/server/http/schemas';
import type { ProgramKind } from '../programs/schema';
import type { TaskStatus } from '../tasks/contracts';
import { GOAL_STATUSES, type GoalStatus, SESSION_STATUSES, type SessionStatus } from './schema';

/**
 * mentoring — API contracts of sessions and goals (ADR-0012 sections 4, 6 and 7). Inputs are
 * strict (SEC-A7). A session's time is a day and a wall-clock time in the organization's time
 * zone; it is stored in UTC (ADR-0013).
 */

const M = messagesFor('fa').mentoringErrors;

/** `HH:MM`, 24-hour. */
export const timeInput = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, M.badTime);

/**
 * A meeting link or a place as free text (SEC-X2): anything that looks like a link must be a
 * plain https URL; the system never opens it.
 */
export const locationInput = shortText(500).superRefine((value, ctx) => {
  if (value === null || !/^[a-z][a-z0-9+.-]*:/i.test(value)) return;
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    ctx.addIssue({ code: 'custom', message: HTTPS_URL_MESSAGE });
  }
});

// ---- sessions ------------------------------------------------------------------------------

/**
 * POST /sessions: one member's session (`enrollmentId`) or, without it, a group session of
 * the whole run (group runs only). `mentorId` defaults to the actor (a mentor) or the member's
 * primary mentor (an admin).
 */
export const createSessionInput = z.strictObject({
  runId: uuidInput,
  enrollmentId: uuidInput.nullable().optional(),
  mentorId: uuidInput.optional(),
  day: dayInput,
  time: timeInput,
  durationMinutes: intInput(5, 600),
  location: locationInput.optional(),
});
export type CreateSessionInput = z.infer<typeof createSessionInput>;

/**
 * PATCH /sessions/:id: reschedule, change the mentor or place, or record what happened —
 * `held`, `no_show`, `cancelled` (with a reason) or back to `scheduled`.
 */
export const updateSessionInput = z.strictObject({
  mentorId: uuidInput.optional(),
  day: dayInput.optional(),
  time: timeInput.optional(),
  durationMinutes: intInput(5, 600).optional(),
  location: locationInput.optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  cancelledReason: shortText(300).optional(),
  countsTowardQuota: z.boolean().optional(),
});
export type UpdateSessionInput = z.infer<typeof updateSessionInput>;

/** POST /sessions/:id/actions: a "next action" as a task for the member (or one of a group). */
export const sessionActionInput = z.strictObject({
  title: requiredShortText(200, M.actionTitle),
  description: longText(4000).nullable().optional(),
  dueDate: dayInput,
  studentId: uuidInput.optional(),
});
export type SessionActionInput = z.infer<typeof sessionActionInput>;

/** GET /sessions: by run or student; `when` = upcoming (from now) or past. */
export const sessionListQuery = z.strictObject({
  runId: uuidInput.optional(),
  studentId: uuidInput.optional(),
  when: z.enum(['upcoming', 'past']).optional(),
});
export type SessionListQuery = z.infer<typeof sessionListQuery>;

export type PersonRef = { id: string; displayName: string };

export type SessionActionDTO = {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt: string;
  student: PersonRef;
};

export type SessionDTO = {
  id: string;
  run: { id: string; title: string; kind: ProgramKind };
  enrollmentId: string | null;
  /** null: a group session of the whole run. */
  student: PersonRef | null;
  mentor: PersonRef;
  scheduledAt: string;
  endsAt: string;
  durationMinutes: number;
  location: string | null;
  status: SessionStatus;
  countsTowardQuota: boolean;
  cancelledReason: string | null;
  /** Next actions (tasks of this session) the viewer may see. */
  actions: SessionActionDTO[];
  can: { edit: boolean };
};

/** A write answers with the session and how many of the mentor's other sessions overlap. */
export type SessionWriteDTO = { session: SessionDTO; overlaps: number };

// ---- goals ---------------------------------------------------------------------------------

export const createGoalInput = z.strictObject({
  title: requiredShortText(200, M.goalTitle),
  description: longText(2000).nullable().optional(),
  targetDate: dayInput.nullable().optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalInput>;

export const updateGoalInput = z.strictObject({
  title: requiredShortText(200, M.goalTitle).optional(),
  description: longText(2000).nullable().optional(),
  targetDate: dayInput.nullable().optional(),
  status: z.enum(GOAL_STATUSES).optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalInput>;

export type GoalDTO = {
  id: string;
  enrollmentId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: GoalStatus;
  decidedAt: string | null;
};

export type GoalListDTO = { goals: GoalDTO[]; can: { edit: boolean } };
