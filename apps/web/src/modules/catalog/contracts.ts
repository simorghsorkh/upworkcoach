import { z } from 'zod';
import {
  dayInput,
  httpsUrl,
  intInput,
  longText,
  queryFlag,
  requiredShortText,
  uuidInput,
} from '@/server/http/schemas';
import { CANNED_RESPONSE_CATEGORIES, SUBMISSION_TYPES, TASK_KINDS } from './schema';

/**
 * catalog — settings keys and the API contracts of tracks, platforms and stages
 * (data-model.md 2-2, api.md sections 5 and 13). All inputs are `.strict()` (SEC-A7).
 */

// ---- settings ------------------------------------------------------------------------

/**
 * Sprint 1 only needs `access`; the other keys (health.rules, sla, business_hours,
 * questions, checkin, tasks) arrive with their modules.
 */
export const accessSettingsSchema = z.strictObject({
  mentorScope: z.enum(['assigned', 'all']),
  mentorsCanInviteStudents: z.boolean(),
});

export type AccessSettings = z.infer<typeof accessSettingsSchema>;

/** `sla` (PRD F7, mentor-workflow.md section 4). Hours; `clock` = business or calendar (E6). */
export const slaSettingsSchema = z.strictObject({
  questionHours: z.number().positive().max(10_000),
  urgentQuestionHours: z.number().positive().max(10_000),
  /** Review SLA of gate tasks (`required_for_gate`). */
  reviewHours: z.number().positive().max(10_000),
  /**
   * Review SLA of every other task (mentor-workflow.md section 4; data-model.md 2-2; F-09).
   * A value saved before this key existed reads as 72.
   */
  reviewHoursNonGate: z.number().positive().max(10_000).default(72),
  redNoActionHours: z.number().positive().max(10_000),
  redEscalateDays: z.number().positive().max(365),
  clock: z.enum(['business', 'calendar']),
});
export type SlaSettings = z.infer<typeof slaSettingsSchema>;

const openHours = z
  .tuple([z.number().min(0).max(24), z.number().min(0).max(24)])
  .refine(([from, to]) => to > from, { message: 'مقدار نامعتبر است' })
  .nullable();

/** `business_hours` (mentor-workflow.md section 4; assumption pending the founder). */
export const businessHoursSchema = z.strictObject({
  timezone: z.literal('Asia/Tehran'),
  week: z.strictObject({
    sat: openHours,
    sun: openHours,
    mon: openHours,
    tue: openHours,
    wed: openHours,
    thu: openHours,
    fri: openHours,
  }),
  holidays: z.array(dayInput).max(400),
});
export type BusinessHoursSettings = z.infer<typeof businessHoursSchema>;

/** `tasks` (progress-tracking.md 4-1): default deadline in days. */
export const tasksSettingsSchema = z.strictObject({
  defaultDueDays: z.number().int().min(1).max(365),
});
export type TasksSettings = z.infer<typeof tasksSettingsSchema>;

/** `questions` (F8): the response time the student sees. */
export const questionsSettingsSchema = z.strictObject({
  expectedResponseText: requiredShortText(120, 'متن زمان پاسخ را بنویس.'),
});
export type QuestionsSettings = z.infer<typeof questionsSettingsSchema>;

export const WEEKDAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * `checkin` (progress-tracking.md 6-3, decision E5): weekly check-in on/off and the day the
 * form opens (it stays open until the end of Friday). On → R-CHECKIN and R-MOOD run.
 */
export const checkinSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  weekday: z.enum(WEEKDAYS),
});
export type CheckinSettings = z.infer<typeof checkinSettingsSchema>;

const days = z.number().min(0).max(3650);
const count = z.number().int().min(1).max(1000);

/**
 * `health.rules` (PRD F7, progress-tracking.md 7-2, data-model.md 4-2). Every threshold of
 * `evaluateHealth`; «days» are elapsed time (24 h = 1 day, ADR-0005). Red never below yellow.
 */
export const healthRulesSchema = z
  .strictObject({
    /** R-INACT: days without student activity (≥). */
    inactivity: z.strictObject({ yellowDays: days, redDays: days }),
    /** R-STALL: time in stage vs `expected_days` (> factor). */
    stall: z.strictObject({
      yellowFactor: z.number().min(1).max(20),
      redFactor: z.number().min(1).max(20),
    }),
    /**
     * R-OVERDUE: yellow = one task overdue more than `yellowDays`; red = one more than
     * `redDays`, or `redCount` tasks overdue more than `redCountMinDays` (0 = any delay).
     */
    overdue: z.strictObject({
      yellowDays: days,
      redDays: days,
      redCount: count,
      redCountMinDays: days,
    }),
    /** R-LOOP: highest revision count of an open task (≥). */
    loop: z.strictObject({ yellowRevisions: count, redRevisions: count }),
    /** R-NOTASK: days without any open task (≥). */
    noTask: z.strictObject({ yellowDays: days, redDays: days }),
    /** R-EXTEND: highest extension count of an open task (≥); yellow only. */
    extend: z.strictObject({ yellowExtensions: count }),
    /** R-CHECKIN: consecutive closed weeks without a check-in (≥). */
    checkin: z.strictObject({ yellowWeeks: count, redWeeks: count }),
    /** R-MOOD: latest mood ≤ `maxMood` → yellow; `redConsecutiveWeeks` weeks in a row → red. */
    mood: z.strictObject({ maxMood: z.number().int().min(1).max(5), redConsecutiveWeeks: count }),
    /** «خطر ریزش»: this many of R-INACT, R-CHECKIN, R-MOOD active at once → red. */
    churnRisk: z.strictObject({ minRules: z.number().int().min(1).max(3) }),
  })
  .superRefine((r, ctx) => {
    const pairs: Array<[string, number, number]> = [
      ['inactivity', r.inactivity.yellowDays, r.inactivity.redDays],
      ['stall', r.stall.yellowFactor, r.stall.redFactor],
      ['overdue', r.overdue.yellowDays, r.overdue.redDays],
      ['loop', r.loop.yellowRevisions, r.loop.redRevisions],
      ['noTask', r.noTask.yellowDays, r.noTask.redDays],
      ['checkin', r.checkin.yellowWeeks, r.checkin.redWeeks],
    ];
    for (const [key, yellow, red] of pairs) {
      if (red < yellow) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'آستانه‌ی قرمز باید از زرد بیشتر باشد.',
        });
      }
    }
  });
export type HealthRules = z.infer<typeof healthRulesSchema>;

export const DEFAULT_HEALTH_RULES: HealthRules = {
  inactivity: { yellowDays: 7, redDays: 14 },
  stall: { yellowFactor: 1.5, redFactor: 2 },
  overdue: { yellowDays: 3, redDays: 7, redCount: 2, redCountMinDays: 0 },
  loop: { yellowRevisions: 3, redRevisions: 4 },
  noTask: { yellowDays: 3, redDays: 7 },
  extend: { yellowExtensions: 3 },
  checkin: { yellowWeeks: 1, redWeeks: 2 },
  mood: { maxMood: 2, redConsecutiveWeeks: 2 },
  churnRisk: { minRules: 2 },
};

export const SETTINGS_DEFAULTS = {
  access: { mentorScope: 'assigned', mentorsCanInviteStudents: true } satisfies AccessSettings,
  questions: { expectedResponseText: 'معمولاً تا ۲۴ ساعت' } satisfies QuestionsSettings,
  /** data-model.md default (off); the seed turns it on (decision E5). */
  checkin: { enabled: false, weekday: 'thu' } satisfies CheckinSettings,
  'health.rules': DEFAULT_HEALTH_RULES,
  sla: {
    questionHours: 24,
    urgentQuestionHours: 4,
    reviewHours: 48,
    reviewHoursNonGate: 72,
    redNoActionHours: 48,
    redEscalateDays: 7,
    clock: 'business',
  } satisfies SlaSettings,
  business_hours: {
    timezone: 'Asia/Tehran',
    week: {
      sat: [9, 21],
      sun: [9, 21],
      mon: [9, 21],
      tue: [9, 21],
      wed: [9, 21],
      thu: [9, 14],
      fri: null,
    },
    holidays: [],
  } satisfies BusinessHoursSettings,
  tasks: { defaultDueDays: 3 } satisfies TasksSettings,
} as const;

// ---- list queries --------------------------------------------------------------------

/** `GET /tracks`, `/platforms`, `/stages`: `includeInactive` is honoured for admins only. */
export const catalogListQuery = z.strictObject({
  includeInactive: queryFlag.optional(),
});

// ---- platforms -----------------------------------------------------------------------

export const createPlatformInput = z.strictObject({
  name: requiredShortText(60, 'نام پلتفرم را وارد کن.'),
  trackId: uuidInput.nullable().optional(),
  sortOrder: intInput(0, 10_000).optional(),
  isActive: z.boolean().optional(),
});

export const updatePlatformInput = z.strictObject({
  name: requiredShortText(60, 'نام پلتفرم را وارد کن.').optional(),
  trackId: uuidInput.nullable().optional(),
  sortOrder: intInput(0, 10_000).optional(),
  isActive: z.boolean().optional(),
});

export type CreatePlatformInput = z.infer<typeof createPlatformInput>;
export type UpdatePlatformInput = z.infer<typeof updatePlatformInput>;

// ---- stages --------------------------------------------------------------------------

const contentLinkInput = z.strictObject({
  title: requiredShortText(120, 'عنوان لینک را وارد کن.'),
  url: httpsUrl,
});

const stageFields = {
  displayCode: requiredShortText(10, 'برچسب مرحله را وارد کن.'),
  name: requiredShortText(120, 'نام مرحله را وارد کن.'),
  sortOrder: intInput(0, 10_000),
  expectedDays: intInput(1, 3650).nullable(),
  isOpenEnded: z.boolean(),
  studentDescription: longText(2000).nullable(),
  contentLinks: z.array(contentLinkInput).max(20, 'حداکثر ۲۰ لینک مجاز است.'),
};

export const createStageInput = z.strictObject({
  displayCode: stageFields.displayCode,
  name: stageFields.name,
  sortOrder: stageFields.sortOrder.optional(),
  expectedDays: stageFields.expectedDays.optional(),
  isOpenEnded: stageFields.isOpenEnded.optional(),
  studentDescription: stageFields.studentDescription.optional(),
  contentLinks: stageFields.contentLinks.optional(),
  /** Lets an admin prepare a stage before showing it. */
  isActive: z.boolean().optional(),
});

/**
 * `PATCH /stages/:id`. Deactivation has its own route (409 while active students are in the
 * stage); here `isActive` may only be `true` (reactivation).
 */
export const updateStageInput = z.strictObject({
  displayCode: stageFields.displayCode.optional(),
  name: stageFields.name.optional(),
  sortOrder: stageFields.sortOrder.optional(),
  expectedDays: stageFields.expectedDays.optional(),
  isOpenEnded: stageFields.isOpenEnded.optional(),
  studentDescription: stageFields.studentDescription.optional(),
  contentLinks: stageFields.contentLinks.optional(),
  isActive: z.literal(true).optional(),
});

export const reorderStagesInput = z.strictObject({
  stageIds: z.array(uuidInput).min(1).max(200),
});

export type CreateStageInput = z.infer<typeof createStageInput>;
export type UpdateStageInput = z.infer<typeof updateStageInput>;

// ---- DTOs ----------------------------------------------------------------------------

export type TrackDTO = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type PlatformDTO = {
  id: string;
  name: string;
  trackId: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type ContentLinkDTO = { title: string; url: string };

/** `GET /stages` row (api.md section 5). Readable by every signed-in role. */
export type StageDTO = {
  id: string;
  displayCode: string;
  name: string;
  sortOrder: number;
  expectedDays: number | null;
  isOpenEnded: boolean;
  studentDescription: string | null;
  contentLinks: ContentLinkDTO[];
  isActive: boolean;
};

/** Short references embedded in other DTOs. */
export type StageRef = { id: string; name: string; displayCode: string };
export type TrackRef = { id: string; code: string; name: string };
export type PlatformRef = { id: string; name: string };

// ---- task templates (data-model.md 2-2; api.md section 6) ------------------------------

export type TaskKind = (typeof TASK_KINDS)[number];
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

const templateFields = {
  stageId: uuidInput.nullable(),
  title: requiredShortText(200, 'عنوان را وارد کن.'),
  description: longText(5000).nullable(),
  kind: z.enum(TASK_KINDS),
  submissionType: z.enum(SUBMISSION_TYPES),
  defaultDueDays: intInput(1, 365).nullable(),
  requiredForGate: z.boolean(),
  suggestOnStageEntry: z.boolean(),
  sortOrder: intInput(0, 10_000),
  isActive: z.boolean(),
};

/** POST /task-templates (A). */
export const createTaskTemplateInput = z.strictObject({
  title: templateFields.title,
  stageId: templateFields.stageId.optional(),
  description: templateFields.description.optional(),
  kind: templateFields.kind.optional(),
  submissionType: templateFields.submissionType.optional(),
  defaultDueDays: templateFields.defaultDueDays.optional(),
  requiredForGate: templateFields.requiredForGate.optional(),
  suggestOnStageEntry: templateFields.suggestOnStageEntry.optional(),
  sortOrder: templateFields.sortOrder.optional(),
  isActive: templateFields.isActive.optional(),
});
export type CreateTaskTemplateInput = z.infer<typeof createTaskTemplateInput>;

/** PATCH /task-templates/:id (A). */
export const updateTaskTemplateInput = z.strictObject({
  title: templateFields.title.optional(),
  stageId: templateFields.stageId.optional(),
  description: templateFields.description.optional(),
  kind: templateFields.kind.optional(),
  submissionType: templateFields.submissionType.optional(),
  defaultDueDays: templateFields.defaultDueDays.optional(),
  requiredForGate: templateFields.requiredForGate.optional(),
  suggestOnStageEntry: templateFields.suggestOnStageEntry.optional(),
  sortOrder: templateFields.sortOrder.optional(),
  isActive: templateFields.isActive.optional(),
});
export type UpdateTaskTemplateInput = z.infer<typeof updateTaskTemplateInput>;

/** GET /task-templates (A, M). Inactive ones only for admins who ask. */
export const listTaskTemplatesQuery = z.strictObject({
  stageId: uuidInput.optional(),
  includeInactive: queryFlag.optional(),
});
export type ListTaskTemplatesQuery = z.infer<typeof listTaskTemplatesQuery>;

export type TaskTemplateDTO = {
  id: string;
  stageId: string | null;
  title: string;
  description: string | null;
  kind: TaskKind;
  submissionType: SubmissionType;
  defaultDueDays: number | null;
  requiredForGate: boolean;
  suggestOnStageEntry: boolean;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
};

// ---- settings API (api.md section 13) ------------------------------------------------

/** Every settings key and the zod schema of its value (data-model.md 2-2). */
export const SETTINGS_SCHEMAS = {
  access: accessSettingsSchema,
  sla: slaSettingsSchema,
  business_hours: businessHoursSchema,
  tasks: tasksSettingsSchema,
  questions: questionsSettingsSchema,
  checkin: checkinSettingsSchema,
  'health.rules': healthRulesSchema,
} as const;
export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[];

export type SettingsValues = {
  access: AccessSettings;
  sla: SlaSettings;
  business_hours: BusinessHoursSettings;
  tasks: TasksSettings;
  questions: QuestionsSettings;
  checkin: CheckinSettings;
  'health.rules': HealthRules;
};

/** One key: current value (default when never saved), its version (0 = default). */
export type SettingEntryDTO<K extends SettingsKey = SettingsKey> = {
  key: K;
  value: SettingsValues[K];
  version: number;
  updatedAt: string | null;
};

/** GET /settings (A): every key. */
export type SettingsDTO = { [K in SettingsKey]: SettingEntryDTO<K> };

/** PUT /settings (A): any subset of keys, each validated by its schema; one transaction. */
export const updateSettingsInput = z.strictObject({
  access: accessSettingsSchema.optional(),
  sla: slaSettingsSchema.optional(),
  business_hours: businessHoursSchema.optional(),
  tasks: tasksSettingsSchema.optional(),
  questions: questionsSettingsSchema.optional(),
  checkin: checkinSettingsSchema.optional(),
  'health.rules': healthRulesSchema.optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;

/** GET /settings/public (*): what every signed-in role may know. */
export type PublicSettingsDTO = {
  questions: { expectedResponseText: string };
  checkin: { enabled: boolean; weekday: Weekday };
};

/**
 * GET /settings/staff (A, M): read-only view for staff screens (e.g. hide «هنرجوی جدید»
 * when mentors may not invite students; show SLA thresholds).
 */
export type StaffSettingsDTO = PublicSettingsDTO & {
  access: AccessSettings;
  sla: Pick<
    SlaSettings,
    'questionHours' | 'urgentQuestionHours' | 'reviewHours' | 'reviewHoursNonGate' | 'clock'
  >;
};

// ---- milestone types (api.md section 12) ---------------------------------------------

const milestoneTypeFields = {
  name: requiredShortText(120, 'نام نوع را وارد کن.'),
  countsForNorthStar: z.boolean(),
  uniquePerStudent: z.boolean(),
  requiresEvidence: z.boolean(),
  sortOrder: intInput(0, 10_000),
  isActive: z.boolean(),
};

export const createMilestoneTypeInput = z.strictObject({
  name: milestoneTypeFields.name,
  countsForNorthStar: milestoneTypeFields.countsForNorthStar.optional(),
  uniquePerStudent: milestoneTypeFields.uniquePerStudent.optional(),
  requiresEvidence: milestoneTypeFields.requiresEvidence.optional(),
  sortOrder: milestoneTypeFields.sortOrder.optional(),
  isActive: milestoneTypeFields.isActive.optional(),
});
export type CreateMilestoneTypeInput = z.infer<typeof createMilestoneTypeInput>;

export const updateMilestoneTypeInput = z.strictObject({
  name: milestoneTypeFields.name.optional(),
  countsForNorthStar: milestoneTypeFields.countsForNorthStar.optional(),
  uniquePerStudent: milestoneTypeFields.uniquePerStudent.optional(),
  requiresEvidence: milestoneTypeFields.requiresEvidence.optional(),
  sortOrder: milestoneTypeFields.sortOrder.optional(),
  isActive: milestoneTypeFields.isActive.optional(),
});
export type UpdateMilestoneTypeInput = z.infer<typeof updateMilestoneTypeInput>;

export type MilestoneTypeDTO = {
  id: string;
  name: string;
  countsForNorthStar: boolean;
  uniquePerStudent: boolean;
  requiresEvidence: boolean;
  sortOrder: number;
  isActive: boolean;
};

// ---- canned responses (api.md section 10) --------------------------------------------

export type CannedResponseCategory = (typeof CANNED_RESPONSE_CATEGORIES)[number];

export const createCannedResponseInput = z.strictObject({
  title: requiredShortText(120, 'عنوان را وارد کن.'),
  body: longText(5000).pipe(z.string({ message: 'متن پاسخ را بنویس.' })),
  category: z.enum(CANNED_RESPONSE_CATEGORIES).optional(),
  isActive: z.boolean().optional(),
});
export type CreateCannedResponseInput = z.infer<typeof createCannedResponseInput>;

export const updateCannedResponseInput = z.strictObject({
  title: requiredShortText(120, 'عنوان را وارد کن.').optional(),
  body: longText(5000)
    .pipe(z.string({ message: 'متن پاسخ را بنویس.' }))
    .optional(),
  category: z.enum(CANNED_RESPONSE_CATEGORIES).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCannedResponseInput = z.infer<typeof updateCannedResponseInput>;

export type CannedResponseDTO = {
  id: string;
  title: string;
  body: string;
  category: CannedResponseCategory;
  isActive: boolean;
  updatedAt: string;
};
