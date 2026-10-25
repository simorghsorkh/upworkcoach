import { z } from 'zod';
import {
  dayInput,
  intInput,
  isoInstantInput,
  requiredShortText,
  uuidInput,
} from '@/server/http/schemas';
import type { REMINDER_SOURCES, REMINDER_STATUSES } from './schema';

/**
 * reminders — API inputs and DTOs (api.md section 8, PRD F6). Inputs are `.strict()`.
 * A due time is either an instant (`dueAt`) or a Tehran day (`dueDate` → 09:00 Tehran).
 */

export type ReminderStatus = (typeof REMINDER_STATUSES)[number];
export type ReminderSource = (typeof REMINDER_SOURCES)[number];

const reminderText = requiredShortText(300, 'متن یادآور را بنویس.');
const ONE_DUE = 'فقط یکی از «زمان» یا «روز» را بفرست.';

/**
 * POST /reminders (A, M). M: `ownerId` = themself (another id → 422) and `studentId` in
 * scope. A: `ownerId` = any active admin or mentor (C3); default the actor.
 */
export const createReminderInput = z
  .strictObject({
    text: reminderText,
    dueAt: isoInstantInput.optional(),
    dueDate: dayInput.optional(),
    studentId: uuidInput.nullable().optional(),
    ownerId: uuidInput.optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.dueAt === undefined) === (value.dueDate === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [value.dueAt === undefined ? 'dueDate' : 'dueAt'],
        message: value.dueAt === undefined ? 'روز یادآور را انتخاب کن.' : ONE_DUE,
      });
    }
  });
export type CreateReminderInput = z.infer<typeof createReminderInput>;

/** PATCH /reminders/:id (owner, A). Only open reminders. */
export const updateReminderInput = z
  .strictObject({
    text: reminderText.optional(),
    dueAt: isoInstantInput.optional(),
    dueDate: dayInput.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.dueAt !== undefined && value.dueDate !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['dueAt'], message: ONE_DUE });
    }
  });
export type UpdateReminderInput = z.infer<typeof updateReminderInput>;

/** POST /reminders/:id/snooze — 1 day, 3 days or 1 week (F6). */
export const snoozeReminderInput = z.strictObject({
  days: intInput(1, 7).refine((d) => d === 1 || d === 3 || d === 7, {
    message: 'فقط ۱، ۳ یا ۷ روز.',
  }),
});
export type SnoozeReminderInput = z.infer<typeof snoozeReminderInput>;

export const REMINDER_SCOPES = ['today', 'upcoming', 'done'] as const;

/**
 * GET /reminders (A, M). `scope`: today = open and due before the end of today in Tehran
 * (past ones included); upcoming = open and later; done = done (latest 100).
 * `ownerId`: admin filter (default: the actor); a mentor always sees only their own.
 */
export const listRemindersQuery = z.strictObject({
  scope: z.enum(REMINDER_SCOPES).optional(),
  ownerId: uuidInput.optional(),
  studentId: uuidInput.optional(),
});
export type ListRemindersQuery = z.infer<typeof listRemindersQuery>;

export type ReminderDTO = {
  id: string;
  text: string;
  dueAt: string;
  status: ReminderStatus;
  /** Open and due time already passed. */
  overdue: boolean;
  doneAt: string | null;
  snoozeCount: number;
  source: ReminderSource;
  student: { id: string; displayName: string } | null;
  owner: { id: string; displayName: string };
  createdAt: string;
  updatedAt: string;
};
