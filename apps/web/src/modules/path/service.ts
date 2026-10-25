import { normalizeFa } from '@/lib/text-fa';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { ApiError, errors } from '@/server/http/errors';
import { assertRefs } from '../access/refs';
import { loadInScope } from '../access/scope';
import type { StageDTO } from '../catalog/contracts';
import {
  type AuditMeta,
  getPathStages,
  getStage,
  listSuggestedTemplates,
  type StageInfo,
  setStageInactive,
} from '../catalog/service';
import { recomputeHealthSafe } from '../health/recompute';
import { toHealthSummary } from '../health/summary';
import { daysSince, overExpected } from '../students/policy';
import {
  countActiveStudentsInStage,
  getOwnStudent,
  listStudentsForBoard,
  loadStaffStudentDTO,
  lockStudentForStageChange,
  setCurrentStage,
} from '../students/service';
import { applyStageChangeTasks, prepareStageChangeTasks } from '../tasks/service';
import { recordTimelineEvent } from '../timeline/events';
import type {
  BoardDTO,
  BoardQuery,
  ChangeStageInput,
  ChangeStageResultDTO,
  MyPathDTO,
  MyPathStageDTO,
  StageTransitionDTO,
} from './contracts';
import { checkTransition, pathState } from './policy';
import { insertTransition, listTransitions } from './transitions';

/**
 * path — stage changes, stage history, kanban, "my path" and stage deactivation
 * (api.md section 5). Public functions take `actor` first and check access (ADR-0004).
 * `students.current_stage_id` is written only through students.service.
 */

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

/**
 * PUT /students/:id/stage (A, M in scope), one transaction (data-model.md 2-4):
 * stage_transitions ← students.current_stage_id / stage_entered_at ← timeline_events.
 * Out-of-scope student → 404; inactive or unknown `toStageId` → 422; same stage or a kind
 * against the direction → 409 INVALID_TRANSITION; missing note → 422.
 */
export async function changeStage(
  actor: Actor,
  studentId: string,
  input: ChangeStageInput,
  db: Db = getDb(),
): Promise<ChangeStageResultDTO> {
  assertStaff(actor);
  const { student, taskChanges } = await db.transaction(async (tx) => {
    await loadInScope(tx, actor, 'student', studentId);
    const locked = await lockStudentForStageChange(tx, studentId);
    if (!locked) throw errors.notFound();
    await assertRefs(tx, actor, [
      { field: 'toStageId', kind: 'catalog', catalog: 'stage', id: input.toStageId },
    ]);
    // Gap 4: template / task ids are checked (and tasks locked) before any write.
    const preparedTasks = await prepareStageChangeTasks(
      tx,
      actor,
      studentId,
      {
        createTemplateIds: input.createTemplateIds,
        cancelTaskIds: input.cancelTaskIds,
        cancelReason: input.cancelReason,
      },
      new Date(),
    );
    const [from, to] = await Promise.all([
      getStage(tx, locked.currentStageId),
      getStage(tx, input.toStageId),
    ]);
    if (!from || !to) throw errors.validation({ toStageId: 'مقدار نامعتبر است' });
    const check = checkTransition({
      kind: input.kind,
      fromSortOrder: from.sortOrder,
      toSortOrder: to.sortOrder,
      sameStage: from.id === to.id,
      note: input.note,
    });
    if (check === 'same_stage') {
      throw new ApiError('INVALID_TRANSITION', { message: 'هنرجو همین حالا در این مرحله است.' });
    }
    if (check === 'wrong_direction') {
      throw new ApiError('INVALID_TRANSITION', {
        message:
          input.kind === 'regress'
            ? 'برگشت فقط به مرحله‌ی قبل ممکن است.'
            : 'عبور فقط به مرحله‌ی بعد ممکن است؛ برای برگشت «برگشت» را انتخاب کن.',
      });
    }
    if (check === 'note_required') {
      throw errors.validation({ note: 'برای این نوع تغییر، دلیل را بنویس.' });
    }
    const now = new Date();
    const transitionId = await insertTransition(
      tx,
      {
        studentId,
        fromStageId: from.id,
        toStageId: to.id,
        kind: input.kind,
        note: input.note ?? null,
        actorId: actor.userId,
      },
      now,
    );
    await setCurrentStage(tx, studentId, to.id, now);
    await recordTimelineEvent(tx, {
      studentId,
      type: 'stage.changed',
      actorId: actor.userId,
      subjectType: 'stage_transition',
      subjectId: transitionId,
      data: { from: from.id, to: to.id, kind: input.kind },
      occurredAt: now,
    });
    const taskChanges = await applyStageChangeTasks(tx, actor, studentId, preparedTasks, now);
    return { student: await loadStaffStudentDTO(tx, studentId), taskChanges };
  });
  await recomputeHealthSafe(studentId, db);
  // F3 Should: templates with suggest_on_stage_entry for the new stage (only suggested).
  return {
    student: { ...student, health: (await loadStaffStudentDTO(db, studentId)).health },
    suggestedTemplates: await listSuggestedTemplates(db, input.toStageId),
    createdTasks: taskChanges.createdTasks,
    cancelledTaskIds: taskChanges.cancelledTaskIds,
  };
}

/** GET /students/:id/stage-history (A, M in scope): oldest first. */
export async function getStageHistory(
  actor: Actor,
  studentId: string,
  db: DbOrTx = getDb(),
): Promise<StageTransitionDTO[]> {
  assertStaff(actor);
  await loadInScope(db, actor, 'student', studentId);
  const rows = await listTransitions(db, studentId);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    note: r.note,
    from:
      r.fromId && r.fromName && r.fromDisplayCode
        ? { id: r.fromId, name: r.fromName, displayCode: r.fromDisplayCode }
        : null,
    to: { id: r.toId, name: r.toName, displayCode: r.toDisplayCode },
    actor: { id: r.actorId, displayName: r.actorDisplayName },
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * GET /board (A, M): a column per active stage (plus any inactive stage that still holds a
 * student, so nobody disappears), students of the scope with lifecycle active or paused.
 */
export async function getBoard(
  actor: Actor,
  query: BoardQuery = {},
  db: DbOrTx = getDb(),
): Promise<BoardDTO> {
  assertStaff(actor);
  const [stages, rows] = await Promise.all([
    getPathStages(db, true),
    listStudentsForBoard(db, actor, {
      mentorId: query.mentorId,
      tag: query.tag ? normalizeFa(query.tag) || undefined : undefined,
      health: query.health,
    }),
  ]);
  const now = new Date();
  const byStage = new Map<string, BoardDTO['columns'][number]['students']>();
  for (const row of rows) {
    const stage = stages.find((s) => s.id === row.currentStageId);
    const days = daysSince(row.stageEnteredAt, now);
    const list = byStage.get(row.currentStageId) ?? [];
    list.push({
      id: row.id,
      displayName: row.displayName,
      daysInStage: days,
      overExpected: stage ? overExpected(days, stage) : 'none',
      lifecycleStatus: row.lifecycleStatus,
      health: toHealthSummary(row, now),
      accountStatus: row.accountStatus,
    });
    byStage.set(row.currentStageId, list);
  }
  return {
    columns: stages
      .filter((s) => s.isActive || byStage.has(s.id))
      .map((s) => ({
        stage: {
          id: s.id,
          name: s.name,
          displayCode: s.displayCode,
          expectedDays: s.expectedDays,
          isOpenEnded: s.isOpenEnded,
          isActive: s.isActive,
        },
        // Longest in the stage first.
        students: (byStage.get(s.id) ?? []).sort((a, b) => b.daysInStage - a.daysInStage),
      })),
  };
}

function toMyPathStage(stage: StageInfo, current: StageInfo): MyPathStageDTO {
  return {
    id: stage.id,
    name: stage.name,
    displayCode: stage.displayCode,
    state: pathState(stage, current),
    studentDescription: stage.studentDescription,
    contentLinks: stage.contentLinks.map((l) => ({ title: l.title, url: l.url })),
  };
}

/** GET /me/path (S): current stage, next stage and content links (F3). */
export async function getOwnPath(actor: Actor, db: DbOrTx = getDb()): Promise<MyPathDTO> {
  const own = await getOwnStudent(actor, db); // 403 for staff, 404 without a record
  const all = await getPathStages(db, true);
  const current = all.find((s) => s.id === own.stage.id);
  if (!current) throw errors.notFound();
  const visible = all.filter((s) => s.isActive || s.id === current.id);
  const stages = visible.map((s) => toMyPathStage(s, current));
  const currentDTO = stages.find((s) => s.state === 'current') ?? toMyPathStage(current, current);
  const nextStage = visible.find((s) => s.sortOrder > current.sortOrder && s.id !== current.id);
  return {
    stages,
    current: currentDTO,
    next: nextStage ? toMyPathStage(nextStage, current) : null,
  };
}

/** POST /stages/:id/deactivate (A): 409 while an active student is in the stage. */
export async function deactivateStage(
  actor: Actor,
  stageId: string,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<StageDTO> {
  if (actor.role !== 'admin') throw errors.forbidden();
  if (!isUuid(stageId)) throw errors.notFound();
  return db.transaction(async (tx) => {
    const stage = await getStage(tx, stageId);
    if (!stage) throw errors.notFound();
    if ((await countActiveStudentsInStage(tx, stageId)) > 0) {
      throw errors.conflict('هنوز هنرجوی فعالی در این مرحله است؛ اول آن‌ها را جابه‌جا کن.');
    }
    return setStageInactive(tx, actor, stageId, meta);
  });
}
