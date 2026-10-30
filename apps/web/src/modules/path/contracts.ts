import { z } from 'zod';
import { longText, uuidInput } from '@/server/http/schemas';
import type { ContentLinkDTO, StageRef, TaskTemplateDTO } from '../catalog/contracts';
import type { HealthSummary } from '../health/summary';
import type { OverExpected, StaffStudentDTO } from '../students/contracts';
import type { StaffTaskDTO } from '../tasks/contracts';

/** path — stage change, history, kanban and "my path" (api.md section 5). */

/**
 * PUT /students/:id/stage (A, M). `note` is required for exception and regress.
 * Optional, atomic with the stage change (sprint-3 frontend gap 4): `createTemplateIds`
 * (active templates → one task each, like `POST /students/:id/tasks { templateId }`) and
 * `cancelTaskIds` (non-final tasks of THIS student, cancelled with `cancelReason`, default
 * "Cancelled by the stage change."). One bad id → 422 and nothing (not even the stage) changes.
 */
export const changeStageInput = z.strictObject({
  toStageId: uuidInput,
  kind: z.enum(['advance', 'skip_by_assessment', 'advance_with_exception', 'regress']),
  note: longText(1000).nullable().optional(),
  createTemplateIds: z.array(uuidInput).max(30, 'حداکثر ۳۰ قالب مجاز است.').optional(),
  cancelTaskIds: z.array(uuidInput).max(100, 'حداکثر ۱۰۰ کار مجاز است.').optional(),
  cancelReason: longText(1000).nullable().optional(),
});
export type ChangeStageInput = z.infer<typeof changeStageInput>;

/** GET /board. `mentorId` (uuid or `none`), `tag` and `health` are ANDed with the scope. */
export const boardQuery = z.strictObject({
  mentorId: z.union([uuidInput, z.literal('none')]).optional(),
  tag: z.string().max(160).optional(),
  health: z.enum(['green', 'yellow', 'red', 'paused']).optional(),
});
export type BoardQuery = z.infer<typeof boardQuery>;

/** Templates suggested on entering the new stage (F3 Should); never created automatically. */
export type { TaskTemplateDTO } from '../catalog/contracts';

export type ChangeStageResultDTO = {
  student: StaffStudentDTO;
  suggestedTemplates: TaskTemplateDTO[];
  /**
   * Gap 4: tasks made from `createTemplateIds` and ids cancelled from `cancelTaskIds` (both
   * `[]` when not sent). Optional in the type only so existing fallbacks keep compiling;
   * the API always returns them.
   */
  createdTasks?: StaffTaskDTO[];
  cancelledTaskIds?: string[];
};

export type StageTransitionDTO = {
  id: string;
  kind: 'initial' | 'advance' | 'skip_by_assessment' | 'advance_with_exception' | 'regress';
  note: string | null;
  from: StageRef | null;
  to: StageRef;
  actor: { id: string; displayName: string };
  createdAt: string;
};

export type BoardStudentDTO = {
  id: string;
  displayName: string;
  daysInStage: number;
  overExpected: OverExpected;
  lifecycleStatus: 'active' | 'paused' | 'graduated' | 'dropped';
  /** Staff-only health; null only until the first computation (sprint 4). */
  health: HealthSummary | null;
  /** `invited` = "Not signed in yet" (sprint-2 frontend gap 3). */
  accountStatus: 'invited' | 'active' | 'disabled';
};

export type BoardDTO = {
  columns: Array<{
    stage: StageRef & { expectedDays: number | null; isOpenEnded: boolean; isActive: boolean };
    students: BoardStudentDTO[];
  }>;
};

export type MyPathStageDTO = {
  id: string;
  name: string;
  displayCode: string;
  state: 'passed' | 'current' | 'locked';
  studentDescription: string | null;
  contentLinks: ContentLinkDTO[];
};

/** GET /me/path (S). No expected days, no "over expected" warning (staff-only signals). */
export type MyPathDTO = {
  stages: MyPathStageDTO[];
  current: MyPathStageDTO;
  next: MyPathStageDTO | null;
};
