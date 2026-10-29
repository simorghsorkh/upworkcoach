import { z } from 'zod';
import {
  dayInput,
  intInput,
  longText,
  requiredLongText,
  requiredShortText,
  uuidInput,
} from '@/server/http/schemas';
import { type ContentLinkDTO, contentLinkInput } from '../catalog/contracts';
import { SUBMISSION_TYPES } from '../catalog/schema';
import type { TaskStatus } from '../tasks/contracts';
import {
  ENROLLMENT_MENTOR_ROLES,
  ENROLLMENT_STATUSES,
  type EnrollmentMentorRole,
  type EnrollmentStatus,
  NODE_TYPES,
  type NodeType,
  PROGRAM_KINDS,
  type ProgramKind,
  RUN_MODES,
  RUN_STATUSES,
  type RunMode,
  type RunStatus,
  STAFF_ROLES,
  type StaffRole,
  TEMPLATE_STATUSES,
  type TemplateStatus,
  type TemplateVisibility,
} from './schema';

/**
 * programs — API contracts of templates, runs and enrollments (ADR-0012). All inputs are
 * `.strict()` (SEC-A7). Content (titles, lesson text) is stored as written: it is the
 * organization's own language, never translated by the system (ADR-0013).
 */

// ---- templates -----------------------------------------------------------------------

const packageFields = {
  durationWeeks: intInput(1, 520).nullable(),
  sessionQuota: intInput(1, 1000).nullable(),
  sessionMinutes: intInput(5, 600).nullable(),
  validityDays: intInput(1, 3650).nullable(),
};

export const createTemplateInput = z.strictObject({
  kind: z.enum(PROGRAM_KINDS),
  title: requiredShortText(160),
  description: longText(4000).nullable().optional(),
  durationWeeks: packageFields.durationWeeks.optional(),
  sessionQuota: packageFields.sessionQuota.optional(),
  sessionMinutes: packageFields.sessionMinutes.optional(),
  validityDays: packageFields.validityDays.optional(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateInput>;

export const updateTemplateInput = createTemplateInput.omit({ kind: true }).partial();
export type UpdateTemplateInput = z.infer<typeof updateTemplateInput>;

export const duplicateTemplateInput = z.strictObject({ title: requiredShortText(160) });
export const rejectTemplateInput = z.strictObject({ reason: requiredLongText(1000) });

export const templateListQuery = z.strictObject({
  status: z.enum(TEMPLATE_STATUSES).optional(),
});
export type TemplateListQuery = z.infer<typeof templateListQuery>;

const nodeFields = {
  title: requiredShortText(200),
  body: longText(8000).nullable(),
  contentLinks: z.array(contentLinkInput).max(20),
  isRequired: z.boolean(),
  isGate: z.boolean(),
  expectedDays: intInput(1, 3650).nullable(),
  isOpenEnded: z.boolean(),
  dueOffsetDays: intInput(0, 3650).nullable(),
  submissionType: z.enum(SUBMISSION_TYPES).nullable(),
  checklistItems: z.array(requiredShortText(300)).max(50),
  /** Milestone only (sprint 5): done when the mentee has an approved milestone of this type. */
  milestoneTypeId: uuidInput.nullable(),
};

/** POST /program-templates/:id/nodes. A phase has no `parentId`; any other node needs one. */
export const createNodeInput = z.strictObject({
  parentId: uuidInput.nullable().optional(),
  nodeType: z.enum(NODE_TYPES),
  title: nodeFields.title,
  body: nodeFields.body.optional(),
  contentLinks: nodeFields.contentLinks.optional(),
  isRequired: nodeFields.isRequired.optional(),
  isGate: nodeFields.isGate.optional(),
  expectedDays: nodeFields.expectedDays.optional(),
  isOpenEnded: nodeFields.isOpenEnded.optional(),
  dueOffsetDays: nodeFields.dueOffsetDays.optional(),
  submissionType: nodeFields.submissionType.optional(),
  checklistItems: nodeFields.checklistItems.optional(),
  milestoneTypeId: nodeFields.milestoneTypeId.optional(),
});
export type CreateNodeInput = z.infer<typeof createNodeInput>;

/** PATCH /program-templates/:id/nodes/:nodeId. Type and parent never change. */
export const updateNodeInput = createNodeInput.omit({ parentId: true, nodeType: true }).partial();
export type UpdateNodeInput = z.infer<typeof updateNodeInput>;

/** PUT /program-templates/:id/nodes/order: every sibling of one level, in the new order. */
export const reorderNodesInput = z.strictObject({
  parentId: uuidInput.nullable(),
  nodeIds: z.array(uuidInput).min(1).max(300),
});
export type ReorderNodesInput = z.infer<typeof reorderNodesInput>;

// ---- runs ----------------------------------------------------------------------------

/**
 * POST /program-runs. With `templateId` the run copies the template's nodes (snapshot) and
 * takes its kind; without one it is a one-on-one (`kind` must say so).
 */
export const createRunInput = z.strictObject({
  templateId: uuidInput.nullable().optional(),
  kind: z.enum(PROGRAM_KINDS).optional(),
  mode: z.enum(RUN_MODES),
  title: requiredShortText(160),
  startsOn: dayInput.nullable().optional(),
  endsOn: dayInput.nullable().optional(),
});
export type CreateRunInput = z.infer<typeof createRunInput>;

export const updateRunInput = z.strictObject({
  title: requiredShortText(160).optional(),
  startsOn: dayInput.nullable().optional(),
  endsOn: dayInput.nullable().optional(),
  status: z.enum(RUN_STATUSES).optional(),
});
export type UpdateRunInput = z.infer<typeof updateRunInput>;

export const runListQuery = z.strictObject({ status: z.enum(RUN_STATUSES).optional() });
export type RunListQuery = z.infer<typeof runListQuery>;

export const addStaffInput = z.strictObject({ userId: uuidInput, role: z.enum(STAFF_ROLES) });
export type AddStaffInput = z.infer<typeof addStaffInput>;

/** POST /enrollments/:id/mentors (A): a new primary replaces the current one (transfer). */
export const assignEnrollmentMentorInput = z.strictObject({
  mentorId: uuidInput,
  role: z.enum(ENROLLMENT_MENTOR_ROLES),
  reason: longText(500).optional(),
});
export type AssignEnrollmentMentorInput = z.infer<typeof assignEnrollmentMentorInput>;

export const enrollInput = z.strictObject({
  studentIds: z.array(uuidInput).min(1).max(200),
});
export type EnrollInput = z.infer<typeof enrollInput>;

export const updateEnrollmentInput = z.strictObject({
  status: z.enum(ENROLLMENT_STATUSES),
  pausedUntil: dayInput.nullable().optional(),
});
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentInput>;

/** PUT /enrollments/:id/phase: the same rules as a stage change (path/policy.ts). */
export const changePhaseInput = z.strictObject({
  toNodeId: uuidInput,
  kind: z.enum(['advance', 'skip_by_assessment', 'advance_with_exception', 'regress']),
  note: longText(1000).nullable().optional(),
});
export type ChangePhaseInput = z.infer<typeof changePhaseInput>;

// ---- assignments and progress (Coach Office sprint 5) ----------------------------------

/**
 * POST /program-runs/:id/nodes/:nodeId/assign: a task from an assignment activity for every
 * active or paused member who has none yet. Without `dueDate` the deadline is relative to the
 * start of the run (progress.ts `assignmentDueDay`).
 */
export const assignNodeInput = z.strictObject({ dueDate: dayInput.optional() });
export type AssignNodeInput = z.infer<typeof assignNodeInput>;

/**
 * PUT /enrollments/:id/nodes/:nodeId/completion: `done` marks a lesson, resource, checklist
 * or type-less milestone done (or undoes it); `checklist` sends every tick of a checklist.
 */
export const nodeCompletionInput = z.strictObject({
  done: z.boolean().optional(),
  checklist: z.array(z.boolean()).max(50).optional(),
});
export type NodeCompletionInput = z.infer<typeof nodeCompletionInput>;

// ---- DTOs ----------------------------------------------------------------------------

export type PersonRef = { id: string; displayName: string };

/** Program progress (progress.ts): `percent` is null when nothing required exists. */
export type ProgressDTO = { done: number; total: number; percent: number | null };

/**
 * Package use (sprint 5b, progress.ts `packageUsage`): held and missed sessions against the
 * quota, and the days left of the validity. Warnings only; nothing is blocked.
 */
export type PackageUsageDTO = {
  quota: number | null;
  used: number;
  remaining: number | null;
  validUntil: string | null;
  daysLeft: number | null;
  overQuota: boolean;
  expired: boolean;
};

/** Program-task state of one activity for one enrollment. */
export type ActivityTaskDTO = { id: string; status: TaskStatus; dueAt: string };

export type NodeDTO = {
  id: string;
  nodeType: NodeType;
  title: string;
  body: string | null;
  contentLinks: ContentLinkDTO[];
  sortOrder: number;
  isRequired: boolean;
  isGate: boolean;
  expectedDays: number | null;
  isOpenEnded: boolean;
  dueOffsetDays: number | null;
  submissionType: (typeof SUBMISSION_TYPES)[number] | null;
  checklistItems: string[];
  milestoneTypeId: string | null;
};

/** A phase with its activities, in order. */
export type PhaseDTO = NodeDTO & { activities: NodeDTO[] };

export type TemplateSummaryDTO = {
  id: string;
  kind: ProgramKind;
  title: string;
  status: TemplateStatus;
  visibility: TemplateVisibility;
  /** Made from the 0.1 path; its phases are edited in the stage settings. */
  isLegacy: boolean;
  owner: PersonRef | null;
  revision: number;
  phaseCount: number;
  activityCount: number;
  runCount: number;
  durationWeeks: number | null;
  sessionQuota: number | null;
  updatedAt: string;
};

export type TemplateDTO = TemplateSummaryDTO & {
  description: string | null;
  sourceLocale: string;
  sessionMinutes: number | null;
  validityDays: number | null;
  extensions: Record<string, boolean>;
  rejectionReason: string | null;
  phases: PhaseDTO[];
  /** What the viewer may do (the server checks again on every call). */
  can: {
    edit: boolean;
    run: boolean;
    submit: boolean;
    approve: boolean;
    delete: boolean;
  };
};

export type StaffDTO = PersonRef & { role: StaffRole };

export type RunSummaryDTO = {
  id: string;
  kind: ProgramKind;
  mode: RunMode;
  title: string;
  status: RunStatus;
  isLegacy: boolean;
  template: { id: string; title: string } | null;
  startsOn: string | null;
  endsOn: string | null;
  /** Enrollments the viewer can see. */
  activeCount: number;
  totalCount: number;
  staff: StaffDTO[];
};

export type EnrollmentDTO = {
  id: string;
  student: PersonRef;
  status: EnrollmentStatus;
  pausedUntil: string | null;
  phase: { id: string; title: string; position: number } | null;
  phaseEnteredAt: string | null;
  daysInPhase: number | null;
  sessionQuota: number | null;
  validUntil: string | null;
  enrolledAt: string;
  progress: ProgressDTO;
  usage: PackageUsageDTO;
};

export type RunDTO = RunSummaryDTO & {
  templateRevision: number | null;
  phases: PhaseDTO[];
  enrollments: EnrollmentDTO[];
  /** Average of the members' known percentages (null: none known). */
  averageProgress: number | null;
  /** Per assignment activity: members with a live task, and with an accepted one. */
  assignments: Record<string, { assigned: number; accepted: number }>;
  can: { manage: boolean; manageStaff: boolean; enroll: boolean };
};

/**
 * Where a mentee stands in one course other than the main path (sprint 5c): shown on the
 * student list, «امروز» and the course board next to the 0.1 stage.
 */
export type CoursePhaseDTO = {
  enrollmentId: string;
  run: { id: string; title: string };
  status: 'active' | 'paused';
  phase: { id: string; title: string; position: number } | null;
  phaseCount: number;
  daysInPhase: number | null;
  overExpected: 'none' | 'warn' | 'over';
};

/** GET /students/:id/enrollments (staff): the student's runs. */
export type StudentEnrollmentDTO = {
  id: string;
  run: { id: string; title: string; kind: ProgramKind; mode: RunMode; isLegacy: boolean };
  status: EnrollmentStatus;
  phase: { id: string; title: string; position: number; count: number } | null;
  /** The run's phases in order (the phase change of the student record, sprint 5c). */
  phases: Array<{ id: string; title: string }>;
  enrolledAt: string;
  progress: ProgressDTO;
  usage: PackageUsageDTO;
  /** Current mentors, primary first (sprint 4). */
  mentors: Array<{ id: string; displayName: string; role: EnrollmentMentorRole }>;
};

export type EnrollmentMentorDTO = {
  id: string;
  user: { id: string; displayName: string };
  role: EnrollmentMentorRole;
  startedAt: string;
  endedAt: string | null;
  assignedBy: { id: string; displayName: string } | null;
  reason: string | null;
};

/** GET /enrollments/:id/mentors: current mentors (primary first) and the ended ones. */
export type EnrollmentMentorsDTO = {
  enrollmentId: string;
  studentId: string;
  isLegacy: boolean;
  active: EnrollmentMentorDTO[];
  history: EnrollmentMentorDTO[];
};

export type MyPhaseDTO = {
  id: string;
  title: string;
  body: string | null;
  contentLinks: ContentLinkDTO[];
  state: 'passed' | 'current' | 'locked';
  /** Activities of passed and current phases; a locked phase shows only its title. */
  activities: Array<
    Pick<
      NodeDTO,
      'id' | 'nodeType' | 'title' | 'body' | 'contentLinks' | 'checklistItems' | 'isRequired'
    > & {
      done: boolean;
      /** Assignment: the mentee's task for it, once assigned. */
      task: ActivityTaskDTO | null;
      /** Checklist: the mentee's ticks, by item position. */
      checklistState: boolean[];
      /** Lessons, resources and checklists; a milestone is done by staff or its milestone. */
      canMark: boolean;
    }
  >;
};

/** GET /me/programs (mentee): runs that have started (no drafts), newest first. */
export type MyProgramDTO = {
  enrollmentId: string;
  /** isLegacy: the 0.1 path mirror (sprint 6b: home shows it as the path card instead). */
  run: { id: string; title: string; kind: ProgramKind; status: RunStatus; isLegacy: boolean };
  status: EnrollmentStatus;
  progress: ProgressDTO;
  usage: PackageUsageDTO;
  phases: MyPhaseDTO[];
};

/** POST /program-runs/:id/nodes/:nodeId/assign → 201. */
export type AssignNodeResultDTO = { created: number; skipped: number; taskIds: string[] };

export type { EnrollmentMentorRole };
