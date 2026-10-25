import { z } from 'zod';
import { tehranDayEnd } from '@/lib/tehran-day';
import { dayInput, longText, queryFlag, requiredLongText, uuidInput } from '@/server/http/schemas';
import type { FLAG_CATEGORIES, FLAG_LEVELS, HEALTH_STATUSES } from './schema';

/**
 * health — status, reasons, flags and snooze (api.md section 9, data-model.md 2-11 and 4).
 * Staff only: no type in this file is ever part of a student DTO (ADR-0004 section 3).
 */

export type HealthStatus = (typeof HEALTH_STATUSES)[number];
export type FlagCategory = (typeof FLAG_CATEGORIES)[number];
export type FlagLevel = (typeof FLAG_LEVELS)[number];

/** Rule codes of 0.1 (PRD F7), in the order of the rule table (data-model.md 4-2). */
export const HEALTH_RULES = [
  'R-INACT',
  'R-STALL',
  'R-OVERDUE',
  'R-LOOP',
  'R-NOTASK',
  'R-EXTEND',
  'R-FLAG',
  'R-CHECKIN',
  'R-MOOD',
] as const;
export type HealthRuleCode = (typeof HEALTH_RULES)[number];

/** «توپ در زمین کیست»: student, team (mentor/coach) or both. R-FLAG has none. */
export type HealthBall = 'student' | 'team' | 'both';

/**
 * One active rule. `facts` are raw numbers for the Persian sentence in the UI, e.g.
 * R-OVERDUE `{ overdueCount: 2, maxOverdueDays: 9 }` → «۲ کار عقب، تا ۹ روز».
 *   R-INACT   { days }                       R-STALL  { daysInStage, expectedDays }
 *   R-OVERDUE { overdueCount, maxOverdueDays } R-LOOP  { maxRevisions }
 *   R-NOTASK  { days }                       R-EXTEND { maxExtensions }
 *   R-FLAG    { count, categories }          R-CHECKIN { weeks }
 *   R-MOOD    { mood, weeks }
 */
export type HealthReasonDTO = {
  rule: HealthRuleCode;
  level: 'yellow' | 'red';
  ball: HealthBall | null;
  facts: Record<string, number | string | string[]>;
};

/** GET /students/:id/health (A, M in scope). */
export type HealthDetailDTO = {
  studentId: string;
  status: HealthStatus;
  reasons: HealthReasonDTO[];
  churnRisk: boolean;
  /** Ball of the worst reasons (null when nothing is active). */
  ball: HealthBall | null;
  statusSince: string;
  redSince: string | null;
  computedAt: string;
  /** Only while in the future. */
  snoozedUntil: string | null;
  snoozeReason: string | null;
  snoozedBy: { id: string; displayName: string } | null;
};

/** PUT /students/:id/health/snooze: hidden from the stuck lists until the end of `until`. */
export const snoozeHealthInput = z.strictObject({
  until: dayInput,
  reason: requiredLongText(500, 'دلیل را بنویس.'),
});
export type SnoozeHealthInput = z.infer<typeof snoozeHealthInput>;

/** A day `YYYY-MM-DD` (end of that Tehran day) or an ISO instant. */
const expiryInput = z.union([
  dayInput.transform((day) => tehranDayEnd(day)),
  z
    .string()
    .max(40)
    .refine((v) => /T/.test(v) && !Number.isNaN(Date.parse(v)), { message: 'زمان نامعتبر است' })
    .transform((v) => new Date(v)),
]);

/** POST /students/:id/flags (A, M in scope). */
export const createFlagInput = z.strictObject({
  category: z.enum(['financial', 'platform_access', 'personal', 'language', 'other']),
  level: z.enum(['yellow', 'red']),
  note: longText(1000).nullable().optional(),
  expiresAt: expiryInput.nullable().optional(),
});
export type CreateFlagInput = z.infer<typeof createFlagInput>;

/** GET /students/:id/flags: `active=1` → only active ones. */
export const listFlagsQuery = z.strictObject({ active: queryFlag.optional() });
export type ListFlagsQuery = z.infer<typeof listFlagsQuery>;

export type FlagDTO = {
  id: string;
  studentId: string;
  category: FlagCategory;
  level: FlagLevel;
  note: string | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  createdBy: { id: string; displayName: string };
  clearedAt: string | null;
  clearedBy: { id: string; displayName: string } | null;
};

/** GET /stuck (A, M). `mentorId` (A) = primary mentor filter, ANDed with the scope. */
export const stuckQuery = z.strictObject({
  mentorId: z.union([uuidInput, z.literal('none')]).optional(),
  level: z.enum(['yellow', 'red']).optional(),
  includeSnoozed: queryFlag.optional(),
});
export type StuckQuery = z.infer<typeof stuckQuery>;

/** POST /admin/health/recompute (A): one student, or a full sweep without `studentId`. */
export const recomputeInput = z.strictObject({ studentId: uuidInput.optional() });
export type RecomputeInput = z.infer<typeof recomputeInput>;

export type RecomputeResultDTO = { recomputed: number; resumed: number };
