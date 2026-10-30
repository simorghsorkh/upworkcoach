import { z } from 'zod';
import {
  cursorInput,
  dayInput,
  httpsUrl,
  intInput,
  limitInput,
  longText,
  moneyInput,
  shortText,
  tagsInput,
  uuidInput,
} from '@/server/http/schemas';
import type { PlatformRef, StageRef, TrackRef } from '../catalog/contracts';
import type { HealthSummary } from '../health/summary';
import { displayNameInput, phoneInput } from '../identity/contracts';
import type { CoursePhaseDTO } from '../programs/contracts';
import {
  LIFECYCLE_STATUSES,
  PRIOR_EXPERIENCES,
  PROFILE_KINDS,
  PROFILE_STATUSES,
  RATE_UNITS,
  STUDENT_LEVELS,
} from './schema';

/**
 * students — API inputs and DTOs (api.md section 4, data-model.md 2-3).
 * Every input is `.strict()` (SEC-A7): forbidden fields for a role (e.g. `primaryMentorId`,
 * `currentStageId`, `lifecycleStatus` in PATCH /students/:id; anything but the whitelist
 * in PATCH /me/student) are simply not in the schema → 422.
 */

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];
export type StudentLevel = (typeof STUDENT_LEVELS)[number];
export type PriorExperience = (typeof PRIOR_EXPERIENCES)[number];
export type ProfileKind = (typeof PROFILE_KINDS)[number];
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];
export type RateUnit = (typeof RATE_UNITS)[number];

const scale = intInput(1, 5).nullable();
const isoInstant = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'مقدار نامعتبر است',
  });

// ---- create / list ---------------------------------------------------------------------

/** POST /students — only name and phone are required (F2: under one minute). */
export const createStudentInput = z.strictObject({
  displayName: displayNameInput,
  phone: phoneInput,
  /** Admin only. For a mentor it is ignored and set to the mentor (ADR-0004 1-1). */
  mentorId: uuidInput.nullable().optional(),
  stageId: uuidInput.optional(),
  trackId: uuidInput.nullable().optional(),
  primaryPlatformId: uuidInput.nullable().optional(),
  tags: tagsInput.optional(),
  /** First internal note of the record (timeline module; never shown to the student). */
  initialNote: longText(10_000).nullable().optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentInput>;

export const STUDENT_SORTS = ['name', 'lastActivity', 'stageDays', 'joined', 'health'] as const;

/** Health statuses accepted by the `health` filter of GET /students (api.md section 4). */
export const HEALTH_FILTERS = ['green', 'yellow', 'red', 'paused'] as const;
export type HealthFilter = (typeof HEALTH_FILTERS)[number];

/** `a,b,c` list of allowed values (de-duplicated); anything else → 422. */
function commaList<T extends string>(allowed: readonly T[]) {
  return z
    .string()
    .max(60)
    .transform((value, ctx) => {
      const parts = [...new Set(value.split(',').map((s) => s.trim()))];
      if (!parts.every((p): p is T => (allowed as readonly string[]).includes(p))) {
        ctx.addIssue({ code: 'custom', message: 'مقدار نامعتبر است' });
        return z.NEVER;
      }
      return parts as T[];
    });
}

/** GET /students. Filters are ANDed with the scope; an out-of-scope filter gives []. */
export const listStudentsQuery = z.strictObject({
  q: z.string().max(100).optional(),
  stageId: uuidInput.optional(),
  /** Members of one course (seat held), optionally in one of its phases (sprint 5c). */
  runId: uuidInput.optional(),
  phaseId: uuidInput.optional(),
  /** A uuid, or `none` for unassigned students (only admins ever see them). */
  mentorId: z.union([uuidInput, z.literal('none')]).optional(),
  tag: z.string().max(160).optional(),
  platformId: uuidInput.optional(),
  /** One status, a comma-separated list, or `all`. Default: active,paused. */
  lifecycle: z
    .string()
    .max(60)
    .transform((value, ctx) => {
      if (value === 'all') return [...LIFECYCLE_STATUSES];
      const parts = [...new Set(value.split(',').map((s) => s.trim()))];
      if (
        !parts.every((p): p is LifecycleStatus =>
          (LIFECYCLE_STATUSES as readonly string[]).includes(p),
        )
      ) {
        ctx.addIssue({ code: 'custom', message: 'مقدار نامعتبر است' });
        return z.NEVER;
      }
      return parts as LifecycleStatus[];
    })
    .optional(),
  cohort: z.string().max(160).optional(),
  /** One health status or a comma-separated list (`yellow,red` = "Needs attention"). */
  health: commaList(HEALTH_FILTERS).optional(),
  /** `health`: red → yellow → green → paused, then oldest status first (F7). */
  sort: z.enum(STUDENT_SORTS).optional(),
  limit: limitInput.optional(),
  cursor: cursorInput.optional(),
});
export type ListStudentsQuery = z.infer<typeof listStudentsQuery>;

/** GET /students/tags: tags in the actor's scope with how many students carry each. */
export const studentTagsQuery = z.strictObject({
  /** Same as GET /students (default active,paused; `all` for every status). */
  lifecycle: z
    .string()
    .max(60)
    .transform((value, ctx) => {
      if (value === 'all') return [...LIFECYCLE_STATUSES];
      const parts = [...new Set(value.split(',').map((s) => s.trim()))];
      if (
        !parts.every((p): p is LifecycleStatus =>
          (LIFECYCLE_STATUSES as readonly string[]).includes(p),
        )
      ) {
        ctx.addIssue({ code: 'custom', message: 'مقدار نامعتبر است' });
        return z.NEVER;
      }
      return parts as LifecycleStatus[];
    })
    .optional(),
});
export type StudentTagsQuery = z.infer<typeof studentTagsQuery>;

export type StudentTagsDTO = { tags: Array<{ tag: string; count: number }> };

// ---- staff edit ------------------------------------------------------------------------

/** Fields the student edits about themself (data-model.md 2-3 whitelist). */
const selfEditableFields = {
  messengerHandle: shortText(100).nullable(),
  primarySkill: shortText(120).nullable(),
  skillLevel: scale,
  englishWriting: scale,
  englishSpeaking: scale,
  hoursPerWeek: intInput(0, 168).nullable(),
  incomeGoalUsd: intInput(0, 10_000_000).nullable(),
  goal90d: longText(1000).nullable(),
  priorExperience: z.enum(PRIOR_EXPERIENCES).nullable(),
  selfReportedBlocker: longText(1000).nullable(),
  primaryPlatformId: uuidInput.nullable(),
};

const optionalize = <T extends Record<string, z.ZodType>>(shape: T) =>
  Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof T]: z.ZodOptional<T[K]>;
  };

/**
 * PATCH /students/:id (A, M): every editable field except primaryMentorId, currentStageId
 * and lifecycle (own routes). `joinedAt` is admin-only (migration of existing students).
 */
export const updateStudentInput = z.strictObject({
  ...optionalize(selfEditableFields),
  trackId: uuidInput.nullable().optional(),
  level: z.enum(STUDENT_LEVELS).nullable().optional(),
  cohort: shortText(60).nullable().optional(),
  tags: tagsInput.optional(),
  nicheStatement: longText(500).nullable().optional(),
  joinedAt: isoInstant.optional(),
  ifUpdatedAt: isoInstant.optional(),
});
export type UpdateStudentInput = z.infer<typeof updateStudentInput>;

/** PATCH /me/student (S): whitelist only. */
export const updateOwnStudentInput = z.strictObject({
  ...optionalize(selfEditableFields),
  ifUpdatedAt: isoInstant.optional(),
});
export type UpdateOwnStudentInput = z.infer<typeof updateOwnStudentInput>;

/** PUT /students/:id/mentor (A). `null` = unassigned. */
export const changeMentorInput = z.strictObject({
  mentorId: uuidInput.nullable(),
  reason: longText(500).nullable().optional(),
});

/** PUT /students/:id/lifecycle (A, M). `paused` needs `pausedUntil`. */
export const lifecycleInput = z.strictObject({
  status: z.enum(LIFECYCLE_STATUSES),
  pausedUntil: dayInput.optional(),
  reason: longText(500).nullable().optional(),
});

// ---- profiles --------------------------------------------------------------------------

const currencyInput = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'کد ارز سه‌حرفی است (مثلاً USD).')
  .transform((v) => v.toUpperCase());

const profileFields = {
  publicUrl: httpsUrl.nullable(),
  headline: shortText(200).nullable(),
  rateAmount: moneyInput.nullable(),
  rateCurrency: currencyInput.nullable(),
  rateUnit: z.enum(RATE_UNITS).nullable(),
  status: z.enum(PROFILE_STATUSES),
  niche: shortText(200).nullable(),
  notes: longText(2000).nullable(),
  isPrimary: z.boolean(),
};

/**
 * POST /students/:id/profiles and POST /me/profiles. There is no password field and there
 * never will be (tech-stack.md rule 8): `password` is an unknown key → 422.
 */
export const createProfileInput = z.strictObject({
  platformId: uuidInput,
  kind: z.enum(PROFILE_KINDS),
  ...optionalize(profileFields),
});
export type CreateProfileInput = z.infer<typeof createProfileInput>;

export const updateProfileInput = z.strictObject({
  platformId: uuidInput.optional(),
  kind: z.enum(PROFILE_KINDS).optional(),
  ...optionalize(profileFields),
  ifUpdatedAt: isoInstant.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export const createSnapshotInput = z.strictObject({
  headline: shortText(200).nullable().optional(),
  bodyText: longText(20_000).pipe(z.string({ message: 'متن را وارد کن.' })),
  rateText: shortText(100).nullable().optional(),
});
export type CreateSnapshotInput = z.infer<typeof createSnapshotInput>;

// ---- DTOs ------------------------------------------------------------------------------

export type MentorRef = { id: string; displayName: string };

/** Header summary of the primary showcase. */
export type PrimaryProfileDTO = {
  id: string;
  platformName: string;
  url: string | null;
  headline: string | null;
};

/**
 * Staff-only health (sprint 4; `null` only until the first computation of a student).
 * `reasons` are sorted red first; `facts` are raw numbers for the Persian sentence;
 * `ball` = "Whose court is the ball in". Task columns (sprint 3): `openTaskCount` = not
 * accepted/cancelled, `overdueTaskCount` = open, in_progress or changes_requested past the
 * deadline, `nextTask` = earliest deadline of what the student still has to do.
 */
export type HealthSummaryDTO = HealthSummary;

/**
 * Stage of a staff DTO with its place in the path: `sortOrder` (compare with
 * `GET /stages` to know the direction of a change) and `isActive` (the current stage of a
 * student may have been deactivated).
 */
export type StaffStageRef = StageRef & { sortOrder: number; isActive: boolean };
export type NextTaskDTO = { id: string; title: string; dueAt: string; overdue: boolean };

/** GET /students row (A, M). */
export type StudentListItemDTO = {
  id: string;
  displayName: string;
  accountStatus: 'invited' | 'active' | 'disabled';
  mentor: MentorRef | null;
  stage: StaffStageRef;
  daysInStage: number;
  /** Same rule as the record and the kanban (F3). */
  overExpected: OverExpected;
  lifecycleStatus: LifecycleStatus;
  health: HealthSummaryDTO | null;
  nextTask: NextTaskDTO | null;
  openTaskCount: number;
  overdueTaskCount: number;
  lastActivityAt: string | null;
  tags: string[];
  cohort: string | null;
  primaryProfile: PrimaryProfileDTO | null;
  /** Current phase in each course other than the main path (sprint 5c). */
  courses: CoursePhaseDTO[];
};

/**
 * Counters for the filter chips (sprint-2 frontend gap 1), in the actor's scope with every
 * filter of the request except the one the counter is about: `byLifecycle` ignores the
 * `lifecycle` filter, `byHealth` ignores the `health` filter (`none` = not computed yet;
 * `untracked` = graduated / dropped). `total` = rows matching the whole request.
 */
export type StudentCountsDTO = {
  total: number;
  byLifecycle: Record<LifecycleStatus, number>;
  byHealth: Record<'green' | 'yellow' | 'red' | 'paused' | 'untracked' | 'none', number>;
};

export type StudentListDTO = {
  items: StudentListItemDTO[];
  nextCursor: string | null;
  /** Always present in responses (optional only so older client fallbacks still type-check). */
  counts?: StudentCountsDTO;
};

/** `none` | `warn` (> expectedDays) | `over` (> 2 × expectedDays) — F3. */
export type OverExpected = 'none' | 'warn' | 'over';

/** GET /students/:id (A, M): the full record + header. Never returned on /me routes. */
export type StaffStudentDTO = {
  id: string;
  displayName: string;
  /** null after account erasure. */
  phone: string | null;
  accountStatus: 'invited' | 'active' | 'disabled';
  erased: boolean;
  /**
   * SEC-T5 (F-01): when and on what device (raw User-Agent) the invite was accepted;
   * null until then (and the device after erasure). Staff only.
   */
  inviteAcceptedAt: string | null;
  inviteAcceptedDevice: string | null;
  mentor: MentorRef | null;
  lifecycleStatus: LifecycleStatus;
  pausedUntil: string | null;
  statusReason: string | null;
  stage: StaffStageRef & { expectedDays: number | null; isOpenEnded: boolean };
  stageEnteredAt: string;
  daysInStage: number;
  overExpected: OverExpected;
  track: TrackRef | null;
  primaryPlatform: PlatformRef | null;
  level: StudentLevel | null;
  cohort: string | null;
  tags: string[];
  messengerHandle: string | null;
  primarySkill: string | null;
  skillLevel: number | null;
  englishWriting: number | null;
  englishSpeaking: number | null;
  hoursPerWeek: number | null;
  incomeGoalUsd: number | null;
  goal90d: string | null;
  priorExperience: PriorExperience | null;
  selfReportedBlocker: string | null;
  nicheStatement: string | null;
  joinedAt: string;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  health: HealthSummaryDTO | null;
  nextTask: NextTaskDTO | null;
  openTaskCount: number;
  overdueTaskCount: number;
  primaryProfile: PrimaryProfileDTO | null;
  /** "record 20% complete" indicator (user-flows.md flow 2). `missing` = field names. */
  completeness: { percent: number; missing: string[] };
};

/**
 * GET /me/student (S). Built field by field (ADR-0004 section 3): no health, flags, tags,
 * cohort, level, status reason, last activity or internal ids of staff.
 */
export type SelfStudentDTO = {
  id: string;
  displayName: string;
  phone: string;
  mentor: { displayName: string } | null;
  stage: StageRef;
  stageEnteredAt: string;
  daysInStage: number;
  track: { id: string; name: string } | null;
  primaryPlatform: PlatformRef | null;
  messengerHandle: string | null;
  primarySkill: string | null;
  skillLevel: number | null;
  englishWriting: number | null;
  englishSpeaking: number | null;
  hoursPerWeek: number | null;
  incomeGoalUsd: number | null;
  goal90d: string | null;
  priorExperience: PriorExperience | null;
  selfReportedBlocker: string | null;
  nicheStatement: string | null;
  joinedAt: string;
  updatedAt: string;
};

/** POST /students → 201. `inviteUrl` is shown only this once (`no-store`). */
export type StudentCreatedDTO = {
  student: StaffStudentDTO;
  inviteUrl: string;
  expiresAt: string;
};

/** Platform profile (same shape for staff and the student owner; `notes` is student-visible). */
export type ProfileDTO = {
  id: string;
  platform: PlatformRef;
  kind: ProfileKind;
  publicUrl: string | null;
  headline: string | null;
  /** Decimal as a string (`"25.00"`), to avoid float rounding. */
  rateAmount: string | null;
  rateCurrency: string | null;
  rateUnit: RateUnit | null;
  status: ProfileStatus;
  niche: string | null;
  notes: string | null;
  isPrimary: boolean;
  mentorApprovedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfileSnapshotDTO = {
  id: string;
  headline: string | null;
  bodyText: string;
  rateText: string | null;
  createdAt: string;
};

/** GET /students/:id/summary — the panel next to a question (F8). */
export type StudentSummaryDTO = {
  id: string;
  displayName: string;
  stage: StageRef;
  daysInStage: number;
  profiles: ProfileDTO[];
  /** Not finished tasks (status not accepted/cancelled), earliest deadline first. */
  openTasks: NextTaskDTO[];
};
