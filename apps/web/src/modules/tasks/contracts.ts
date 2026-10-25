import { z } from 'zod';
import {
  cursorInput,
  dayInput,
  englishText,
  httpsUrl,
  intInput,
  isoInstantInput,
  limitInput,
  longText,
  queryFlag,
  requiredLongText,
  requiredShortText,
  shortText,
  uuidInput,
} from '@/server/http/schemas';
import type { StageRef, SubmissionType, TaskKind } from '../catalog/contracts';
import type { AttachmentDTO } from '../files/contracts';
import {
  REVIEW_OUTCOMES,
  SUBMISSION_TYPES,
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from './schema';

/**
 * tasks — API inputs and DTOs (api.md section 6, PRD F4). Inputs are `.strict()` (SEC-A7).
 * Students get `StudentTask*DTO`s that are built field by field and never contain
 * `reviewerId`, `createdBy`, `revisionCount`, `extensionCount` or staff-only text such as
 * the cancel reason (ADR-0004 section 3, SEC-A5).
 */

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

/** Optional task fields; with `templateId` the template fills what is not sent. */
const taskFields = {
  title: requiredShortText(200, 'عنوان کار را وارد کن.'),
  description: longText(5000).nullable(),
  kind: z.enum(TASK_KINDS),
  submissionType: z.enum(SUBMISSION_TYPES),
  stageId: uuidInput.nullable(),
  requiredForGate: z.boolean(),
  priority: z.enum(TASK_PRIORITIES),
  /** Tehran day chosen in the Jalali picker → due_at = 23:59:59 Tehran (ADR-0008). */
  dueDate: dayInput,
  reviewerId: uuidInput,
  templateId: uuidInput,
};

/**
 * POST /students/:id/tasks (A, M). `title`, `kind` and `submissionType` are required unless
 * `templateId` provides them. `dueDate` defaults to the template's / settings' default days.
 */
export const createTaskInput = z.strictObject({
  title: taskFields.title.optional(),
  description: taskFields.description.optional(),
  kind: taskFields.kind.optional(),
  submissionType: taskFields.submissionType.optional(),
  stageId: taskFields.stageId.optional(),
  requiredForGate: taskFields.requiredForGate.optional(),
  priority: taskFields.priority.optional(),
  dueDate: taskFields.dueDate.optional(),
  reviewerId: taskFields.reviewerId.optional(),
  templateId: taskFields.templateId.optional(),
  /** For `profile_review`: a showcase of THIS student (C3). */
  profileId: uuidInput.nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

/**
 * POST /tasks/bulk (A, M; Should). Every `studentIds` entry must be in scope, otherwise the
 * whole request is 422 and nothing is created (C3). The reviewer of each task defaults to
 * that student's primary mentor.
 */
export const bulkTasksInput = z.strictObject({
  studentIds: z.array(uuidInput).min(1, 'دست‌کم یک هنرجو انتخاب کن.').max(200),
  title: taskFields.title.optional(),
  description: taskFields.description.optional(),
  kind: taskFields.kind.optional(),
  submissionType: taskFields.submissionType.optional(),
  stageId: taskFields.stageId.optional(),
  requiredForGate: taskFields.requiredForGate.optional(),
  priority: taskFields.priority.optional(),
  dueDate: taskFields.dueDate.optional(),
  reviewerId: taskFields.reviewerId.optional(),
  templateId: taskFields.templateId.optional(),
});
export type BulkTasksInput = z.infer<typeof bulkTasksInput>;

/** PATCH /tasks/:id (A, M). The deadline only changes through /extend. */
export const updateTaskInput = z.strictObject({
  title: taskFields.title.optional(),
  description: taskFields.description.optional(),
  priority: taskFields.priority.optional(),
  reviewerId: taskFields.reviewerId.optional(),
  stageId: taskFields.stageId.optional(),
  requiredForGate: taskFields.requiredForGate.optional(),
  ifUpdatedAt: isoInstantInput.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

/** POST /tasks/:id/extend (A, M): a later deadline with a reason. */
export const extendTaskInput = z.strictObject({
  newDueDate: dayInput,
  reason: requiredLongText(1000, 'دلیل تمدید را بنویس.'),
});
export type ExtendTaskInput = z.infer<typeof extendTaskInput>;

/** POST /tasks/:id/cancel (A, M). */
export const cancelTaskInput = z.strictObject({
  reason: requiredLongText(1000, 'دلیل لغو را بنویس.'),
});
export type CancelTaskInput = z.infer<typeof cancelTaskInput>;

const linkInput = z.strictObject({
  url: httpsUrl,
  label: shortText(200).nullable().optional(),
});

/**
 * POST /tasks/:id/submissions (S). Required fields depend on the task's submission type
 * (`proposal_review`: platformId + jobPostText + proposalText; `checkbox`: nothing).
 * `aiUseConsent` defaults to false (D6). The profile snapshot target comes from the task,
 * never from this body.
 */
export const submitTaskInput = z.strictObject({
  bodyText: longText(10_000).nullable().optional(),
  links: z.array(linkInput).max(10, 'حداکثر ۱۰ لینک مجاز است.').optional(),
  attachmentIds: z.array(uuidInput).max(10, 'حداکثر ۱۰ پیوست مجاز است.').optional(),
  platformId: uuidInput.optional(),
  jobPostText: englishText(20_000).nullable().optional(),
  proposalText: englishText(20_000).nullable().optional(),
  profileText: englishText(20_000).nullable().optional(),
  aiUseConsent: z.boolean().optional(),
});
export type SubmitTaskInput = z.infer<typeof submitTaskInput>;

/**
 * POST /submissions/:id/review (A, M). Feedback in Persian (mentor-workflow.md 6).
 * `nextDueDate` («مهلت نسخه‌ی بعد», sprint-3 frontend gap 3): only with
 * `changes_requested`; the task's deadline becomes the end of that Tehran day (today or
 * later). It is NOT an extension: no `task_extensions` row and no `extensionCount + 1`
 * (R-EXTEND); the change is recorded in the `review.created` event (sprint-4.md).
 */
export const reviewInput = z.strictObject({
  outcome: z.enum(REVIEW_OUTCOMES),
  feedbackText: requiredLongText(10_000, 'بازخورد را بنویس.'),
  score: intInput(1, 5).nullable().optional(),
  nextDueDate: dayInput.optional(),
});
export type ReviewInput = z.infer<typeof reviewInput>;

/** PATCH /reviews/:id (A; M = the reviewer, in scope). Within 24 h; outcome never changes. */
export const updateReviewInput = z.strictObject({
  feedbackText: requiredLongText(10_000, 'بازخورد را بنویس.').optional(),
  score: intInput(1, 5).nullable().optional(),
});
export type UpdateReviewInput = z.infer<typeof updateReviewInput>;

const statusListInput = z
  .string()
  .max(120)
  .transform((value, ctx) => {
    if (value === 'all') return [...TASK_STATUSES];
    const parts = [...new Set(value.split(',').map((s) => s.trim()))];
    if (!parts.every((p): p is TaskStatus => (TASK_STATUSES as readonly string[]).includes(p))) {
      ctx.addIssue({ code: 'custom', message: 'مقدار نامعتبر است' });
      return z.NEVER;
    }
    return parts as TaskStatus[];
  });

/** GET /students/:id/tasks (A, M). Default: every status. */
export const studentTasksQuery = z.strictObject({
  status: statusListInput.optional(),
  stageId: uuidInput.optional(),
});
export type StudentTasksQuery = z.infer<typeof studentTasksQuery>;

/**
 * GET /tasks (A, M; sprint-3 frontend gap 1): tasks of every student in the actor's scope.
 * Filters are ANDed with the scope (a filter outside it only gives an empty list).
 * `overdue=1` = student-actionable and past the deadline. `mentorId` = the student's
 * primary mentor (`none` = unassigned); `reviewerId` = the task's reviewer. `q` searches the
 * task title and the student (name, phone, tags). Default: every status, by deadline.
 */
export const staffTasksQuery = z.strictObject({
  status: statusListInput.optional(),
  overdue: queryFlag.optional(),
  stageId: uuidInput.optional(),
  reviewerId: uuidInput.optional(),
  mentorId: z.union([uuidInput, z.literal('none')]).optional(),
  studentId: uuidInput.optional(),
  kind: z.enum(TASK_KINDS).optional(),
  submissionType: z.enum(SUBMISSION_TYPES).optional(),
  q: z.string().max(100).optional(),
  /** `due`: earliest deadline first (default); `recent`: last change first. */
  sort: z.enum(['due', 'recent']).optional(),
  limit: limitInput.optional(),
  cursor: cursorInput.optional(),
});
export type StaffTasksQuery = z.infer<typeof staffTasksQuery>;

/** GET /me/tasks (S). Default: everything except cancelled. */
export const myTasksQuery = z.strictObject({
  status: statusListInput.optional(),
});
export type MyTasksQuery = z.infer<typeof myTasksQuery>;

/** GET /review-queue (A, M). `mentorId` (admin filter) = reviewer. */
export const reviewQueueQuery = z.strictObject({
  mentorId: uuidInput.optional(),
});
export type ReviewQueueQuery = z.infer<typeof reviewQueueQuery>;

// ---- DTOs (staff) ----------------------------------------------------------------------

export type PersonRef = { id: string; displayName: string };

/** Staff list row (A, M). */
export type StaffTaskDTO = {
  id: string;
  student: PersonRef;
  title: string;
  description: string | null;
  kind: TaskKind;
  submissionType: SubmissionType;
  stage: StageRef | null;
  requiredForGate: boolean;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string;
  originalDueAt: string;
  overdue: boolean;
  overdueDays: number;
  reviewer: PersonRef;
  createdBy: PersonRef;
  templateId: string | null;
  batchId: string | null;
  profile: { id: string; platformName: string; url: string | null } | null;
  revisionCount: number;
  extensionCount: number;
  statusChangedAt: string;
  lastSubmittedAt: string | null;
  closedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffReviewDTO = {
  id: string;
  reviewer: PersonRef;
  outcome: ReviewOutcome;
  feedbackText: string;
  score: number | null;
  createdAt: string;
  updatedAt: string;
  /** The actor may still edit the text (reviewer or admin, within 24 h). */
  editable: boolean;
};

export type StaffSubmissionDTO = {
  id: string;
  version: number;
  bodyText: string | null;
  links: Array<{ url: string; label: string | null }>;
  platform: { id: string; name: string } | null;
  jobPostText: string | null;
  proposalText: string | null;
  profileText: string | null;
  aiUseConsent: boolean;
  submittedBy: PersonRef;
  createdAt: string;
  attachments: AttachmentDTO[];
  review: StaffReviewDTO | null;
};

export type TaskExtensionDTO = {
  id: string;
  previousDueAt: string;
  newDueAt: string;
  reason: string;
  actor: PersonRef;
  createdAt: string;
};

/** GET /tasks/:id for staff: the task + all versions (newest first) + extension history. */
export type StaffTaskDetailDTO = StaffTaskDTO & {
  submissions: StaffSubmissionDTO[];
  extensions: TaskExtensionDTO[];
};

/**
 * GET /tasks → 200. `counts` apply every filter except `status` and `overdue`, so the tabs
 * («منتظر بازبینی»، «معوق»، …) get their numbers from the same request.
 */
export type StaffTaskListDTO = {
  items: StaffTaskDTO[];
  nextCursor: string | null;
  counts: {
    total: number;
    overdue: number;
    byStatus: Record<TaskStatus, number>;
  };
};

/** POST /tasks/bulk → 201. */
export type BulkTasksResultDTO = { batchId: string; created: number; taskIds: string[] };

/** GET /review-queue and the «امروز» review section. */
export type ReviewQueueItemDTO = {
  taskId: string;
  title: string;
  student: PersonRef;
  stage: StageRef | null;
  reviewer: PersonRef;
  requiredForGate: boolean;
  priority: TaskPriority;
  /** Sprint-3 frontend gap 5. */
  submissionType: SubmissionType;
  dueAt: string;
  /** Latest version waiting for review. */
  submissionId: string;
  version: number;
  lastSubmittedAt: string;
  slaHours: number;
  elapsedHours: number;
  /** Negative once breached. */
  slaRemainingHours: number;
  breached: boolean;
  /** Less than 25 % of the SLA left. */
  warning: boolean;
};

// ---- DTOs (student) --------------------------------------------------------------------

/** Review as the student sees it: no reviewer id, only the display name (gap 2). */
export type StudentReviewDTO = {
  outcome: ReviewOutcome;
  feedbackText: string;
  score: number | null;
  createdAt: string;
  reviewer: { displayName: string };
};

export type StudentSubmissionDTO = {
  id: string;
  version: number;
  createdAt: string;
  bodyText: string | null;
  links: Array<{ url: string; label: string | null }>;
  platform: { id: string; name: string } | null;
  jobPostText: string | null;
  proposalText: string | null;
  profileText: string | null;
  aiUseConsent: boolean;
  attachments: AttachmentDTO[];
  review: StudentReviewDTO | null;
};

/** GET /me/tasks row (S). */
export type StudentTaskListItemDTO = {
  id: string;
  title: string;
  description: string | null;
  kind: TaskKind;
  submissionType: SubmissionType;
  stage: StageRef | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string;
  overdue: boolean;
  overdueDays: number;
  /** Outcome of the latest review, for the list badge. */
  latestReview: { outcome: ReviewOutcome; createdAt: string } | null;
};

/** GET /tasks/:id for the student (own task): all versions with their review. */
export type StudentTaskDTO = StudentTaskListItemDTO & {
  submissions: StudentSubmissionDTO[];
};

/** POST /tasks/:id/submissions → 201. */
export type SubmissionCreatedDTO = {
  id: string;
  version: number;
  createdAt: string;
  task: { id: string; status: TaskStatus };
};
