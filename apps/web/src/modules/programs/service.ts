import type { SQL } from 'drizzle-orm';
import { messagesFor } from '@/i18n/messages';
import { addDays, dayIn } from '@/lib/org-day';
import { isUuid, uuidv7 } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { ApiError, errors } from '@/server/http/errors';
import { assertRefs } from '../access/refs';
import { loadInScope, scopeCondition, staffStudentScope } from '../access/scope';
import { recordAudit } from '../admin/service';
import { type AuditMeta, getAccessSettings, getTasksSettings } from '../catalog/service';
import { recomputeHealthSafe } from '../health/recompute';
import { checkTransition } from '../path/policy';
import { changeStage } from '../path/service';
import { daysSince } from '../students/policy';
import { students } from '../students/schema';
import { changeMentor } from '../students/service';
import type { TaskStatus } from '../tasks/contracts';
import { insertProgramTasks, type ProgramTaskTarget } from '../tasks/service';
import type {
  AddStaffInput,
  AssignEnrollmentMentorInput,
  AssignNodeInput,
  AssignNodeResultDTO,
  ChangePhaseInput,
  CreateNodeInput,
  CreateRunInput,
  CreateTemplateInput,
  EnrollInput,
  EnrollmentDTO,
  EnrollmentMentorDTO,
  EnrollmentMentorsDTO,
  MyProgramDTO,
  NodeCompletionInput,
  NodeDTO,
  PackageUsageDTO,
  PhaseDTO,
  ProgressDTO,
  ReorderNodesInput,
  RunDTO,
  RunListQuery,
  RunSummaryDTO,
  StudentEnrollmentDTO,
  TemplateDTO,
  TemplateListQuery,
  TemplateSummaryDTO,
  UpdateEnrollmentInput,
  UpdateNodeInput,
  UpdateRunInput,
  UpdateTemplateInput,
} from './contracts';
import { runPhases } from './course-phases';
import {
  canChangeEnrollmentStatus,
  canChangeRunStatus,
  canRunTemplate,
  holdsSeat,
  isRunOpen,
  phaseState,
  runAccess,
  type TemplateAccess,
  templateAccess,
} from './policy';
import {
  assignmentDueDay,
  averagePercent,
  computeProgress,
  goalProgress,
  isNodeDone,
  type ProgressFacts,
  packageUsage,
} from './progress';
import * as repo from './repo';
import type { curriculumNodes, EnrollmentStatus, RunMode, runNodes } from './schema';

/**
 * programs — program templates, runs and enrollments (ADR-0012, Coach Office sprint 3).
 * Public functions take `actor` first and check access (ADR-0004); every query is limited to
 * the actor's organization (ADR-0011). Messages come from the catalog (`programErrors`), so
 * the API answers in the request's language (ADR-0013).
 *
 * The legacy template and run mirror the 0.1 path (migration 0008): their phases are edited in
 * the stage settings, and a legacy enrollment's phase change goes through path.changeStage,
 * which keeps `students.current_stage_id` the source of truth until the contract migration.
 */

const M = messagesFor('fa').programErrors;
const INVALID = messagesFor('fa').validation.invalid;

function assertStaff(actor: Actor): void {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
}

/** The actor's mentees as a condition over `students` (sprint 3: the 0.1 scope). */
async function menteeCondition(db: DbOrTx, actor: Actor): Promise<SQL> {
  const scope = await staffStudentScope(db, actor);
  return scopeCondition(scope, students.userId, students.organizationId);
}

// ---- nodes → DTOs ----------------------------------------------------------------------

type AnyNodeRow = repo.NodeRow & { stageActive?: boolean | null };

function toNodeDTO(n: AnyNodeRow): NodeDTO {
  return {
    id: n.id,
    nodeType: n.nodeType,
    title: n.title,
    body: n.body,
    contentLinks: n.contentLinks,
    sortOrder: n.sortOrder,
    isRequired: n.isRequired,
    isGate: n.isGate,
    expectedDays: n.expectedDays,
    isOpenEnded: n.isOpenEnded,
    dueOffsetDays: n.dueOffsetDays,
    submissionType: n.submissionType,
    checklistItems: n.checklistItems,
    milestoneTypeId: n.milestoneTypeId,
  };
}

/**
 * Phases in order with their activities. A legacy phase whose 0.1 stage was deactivated is
 * left out unless `keep` holds it (a mentee is still there).
 */
function toPhases(rows: AnyNodeRow[], keep: Set<string> = new Set()): PhaseDTO[] {
  const phases = rows.filter(
    (n) => n.parentId === null && (n.stageActive !== false || keep.has(n.id)),
  );
  return phases.map((p) => ({
    ...toNodeDTO(p),
    activities: rows.filter((n) => n.parentId === p.id).map(toNodeDTO),
  }));
}

// ---- templates -------------------------------------------------------------------------

function factsOf(row: repo.TemplateRow) {
  return {
    ownerId: row.ownerId,
    visibility: row.visibility,
    status: row.status,
    isLegacy: row.legacyPathId !== null,
  };
}

function toTemplateSummary(row: repo.TemplateRow): TemplateSummaryDTO {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    isLegacy: row.legacyPathId !== null,
    owner: row.ownerId && row.ownerName ? { id: row.ownerId, displayName: row.ownerName } : null,
    revision: row.revision,
    phaseCount: row.phaseCount,
    activityCount: row.activityCount,
    runCount: row.runCount,
    durationWeeks: row.durationWeeks,
    sessionQuota: row.sessionQuota,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadTemplate(
  db: DbOrTx,
  actor: Actor,
  id: string,
): Promise<{ row: repo.TemplateRow; access: TemplateAccess }> {
  assertStaff(actor);
  if (!isUuid(id)) throw errors.notFound();
  const row = await repo.findTemplate(db, actor.organizationId, id);
  if (!row) throw errors.notFound();
  const access = templateAccess(actor, factsOf(row));
  if (access === 'none') throw errors.notFound();
  return { row, access };
}

/** The template may be changed by the actor (content or details). */
function assertEditable(row: repo.TemplateRow, access: TemplateAccess): void {
  if (row.legacyPathId !== null) throw errors.conflict(M.legacyTemplate);
  if (access !== 'edit') throw errors.forbidden();
  if (row.status === 'archived') throw errors.conflict(M.templateArchived);
}

async function buildTemplateDTO(
  db: DbOrTx,
  actor: Actor,
  row: repo.TemplateRow,
): Promise<TemplateDTO> {
  const facts = factsOf(row);
  const access = templateAccess(actor, facts);
  const nodes = await repo.listTemplateNodes(db, row.id);
  const editable = access === 'edit' && !facts.isLegacy && row.status !== 'archived';
  return {
    ...toTemplateSummary(row),
    description: row.description,
    sourceLocale: row.sourceLocale,
    sessionMinutes: row.sessionMinutes,
    validityDays: row.validityDays,
    extensions: row.extensions,
    rejectionReason: row.rejectionReason,
    phases: toPhases(nodes),
    can: {
      edit: editable,
      run: canRunTemplate(actor, facts),
      submit:
        actor.role === 'mentor' &&
        row.ownerId === actor.userId &&
        row.visibility === 'private' &&
        row.status === 'published',
      approve: actor.role === 'admin' && row.visibility === 'pending_approval',
      delete: editable && row.status === 'draft' && row.runCount === 0,
    },
  };
}

async function reloadTemplate(db: DbOrTx, actor: Actor, id: string): Promise<TemplateDTO> {
  const row = await repo.findTemplate(db, actor.organizationId, id);
  if (!row) throw errors.notFound();
  return buildTemplateDTO(db, actor, row);
}

/** GET /program-templates (A, M): a mentor sees organization templates and their own. */
export async function listTemplates(
  actor: Actor,
  query: TemplateListQuery = {},
  db: DbOrTx = getDb(),
): Promise<TemplateSummaryDTO[]> {
  assertStaff(actor);
  const rows = await repo.listTemplates(db, actor.organizationId, {
    status: query.status,
    visibleToMentor: actor.role === 'mentor' ? actor.userId : undefined,
  });
  return rows.map(toTemplateSummary);
}

/** GET /program-templates/:id */
export async function getTemplate(
  actor: Actor,
  id: string,
  db: DbOrTx = getDb(),
): Promise<TemplateDTO> {
  const { row } = await loadTemplate(db, actor, id);
  return buildTemplateDTO(db, actor, row);
}

/**
 * POST /program-templates (A, M). An admin's template is for the whole organization; a
 * mentor's stays private until approved. Always starts as a draft.
 */
export async function createTemplate(
  actor: Actor,
  input: CreateTemplateInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<TemplateDTO> {
  assertStaff(actor);
  const { locale } = await repo.organizationDefaults(db, actor.organizationId);
  const id = await db.transaction(async (tx) => {
    const now = new Date();
    const templateId = await repo.insertTemplate(tx, {
      organizationId: actor.organizationId,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      durationWeeks: input.durationWeeks ?? null,
      sessionQuota: input.sessionQuota ?? null,
      sessionMinutes: input.sessionMinutes ?? null,
      validityDays: input.validityDays ?? null,
      sourceLocale: locale,
      status: 'draft',
      visibility: actor.role === 'admin' ? 'organization' : 'private',
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.template_created',
      targetType: 'program_template',
      targetId: templateId,
      data: { kind: input.kind },
      ip: meta.ip ?? null,
    });
    return templateId;
  });
  return reloadTemplate(db, actor, id);
}

/** PATCH /program-templates/:id — details and package; a published template gets +1 revision. */
export async function updateTemplate(
  actor: Actor,
  id: string,
  input: UpdateTemplateInput,
  db: Db = getDb(),
): Promise<TemplateDTO> {
  await db.transaction(async (tx) => {
    const { row, access } = await loadTemplate(tx, actor, id);
    assertEditable(row, access);
    await repo.lockTemplate(tx, actor.organizationId, id);
    const now = new Date();
    await repo.updateTemplate(tx, id, input, now);
    await repo.touchTemplate(tx, id, now);
  });
  return reloadTemplate(db, actor, id);
}

/** DELETE /program-templates/:id — only a draft that no run was made from. */
export async function deleteTemplate(
  actor: Actor,
  id: string,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const { row, access } = await loadTemplate(tx, actor, id);
    assertEditable(row, access);
    if (row.status !== 'draft' || row.runCount > 0) throw errors.conflict(M.deleteOnlyDraft);
    await repo.deleteTemplate(tx, id);
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.template_deleted',
      targetType: 'program_template',
      targetId: id,
      ip: meta.ip ?? null,
    });
  });
}

type StatusAction = 'publish' | 'archive' | 'restore';

/**
 * POST /program-templates/:id/{publish,archive,restore}. Publishing a program needs at least
 * one phase. An archived template keeps its runs but starts no new one.
 */
export async function setTemplateStatus(
  actor: Actor,
  id: string,
  action: StatusAction,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<TemplateDTO> {
  await db.transaction(async (tx) => {
    const { row, access } = await loadTemplate(tx, actor, id);
    if (row.legacyPathId !== null) throw errors.conflict(M.legacyTemplate);
    if (access !== 'edit') throw errors.forbidden();
    await repo.lockTemplate(tx, actor.organizationId, id);
    let status = row.status;
    if (action === 'publish') {
      if (row.status === 'archived') throw errors.conflict(M.templateArchived);
      if (row.status === 'published') throw errors.conflict(M.alreadyPublished);
      if (row.kind === 'program' && row.phaseCount === 0) {
        throw errors.conflict(M.publishNeedsPhase);
      }
      status = 'published';
    } else if (action === 'archive') {
      status = 'archived';
    } else {
      if (row.status !== 'archived') throw errors.conflict(M.notArchived);
      status = 'published';
    }
    if (status === row.status) return;
    await repo.updateTemplate(tx, id, { status }, new Date());
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action:
        action === 'publish'
          ? 'program.template_published'
          : action === 'archive'
            ? 'program.template_archived'
            : 'program.template_restored',
      targetType: 'program_template',
      targetId: id,
      ip: meta.ip ?? null,
    });
  });
  return reloadTemplate(db, actor, id);
}

/**
 * POST /program-templates/:id/duplicate — a new draft owned by the actor with a copy of every
 * node (the legacy template too: "start from the freelancing path").
 */
export async function duplicateTemplate(
  actor: Actor,
  id: string,
  input: { title: string },
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<TemplateDTO> {
  const newId = await db.transaction(async (tx) => {
    const { row } = await loadTemplate(tx, actor, id);
    const now = new Date();
    const copyId = await repo.insertTemplate(tx, {
      organizationId: actor.organizationId,
      kind: row.kind,
      title: input.title,
      description: row.description,
      sourceLocale: row.sourceLocale,
      status: 'draft',
      visibility: actor.role === 'admin' ? 'organization' : 'private',
      ownerId: actor.userId,
      sessionQuota: row.sessionQuota,
      sessionMinutes: row.sessionMinutes,
      validityDays: row.validityDays,
      durationWeeks: row.durationWeeks,
      extensions: row.extensions,
      createdAt: now,
      updatedAt: now,
    });
    const nodes = await repo.listTemplateNodes(tx, id);
    const ids = new Map(nodes.map((n) => [n.id, uuidv7()]));
    const copy = (n: repo.NodeRow): typeof curriculumNodes.$inferInsert => ({
      ...copiedFields(n),
      id: ids.get(n.id) as string,
      templateId: copyId,
      parentId: n.parentId ? (ids.get(n.parentId) ?? null) : null,
      createdAt: now,
      updatedAt: now,
    });
    await repo.insertTemplateNodes(tx, nodes.filter((n) => n.parentId === null).map(copy));
    await repo.insertTemplateNodes(tx, nodes.filter((n) => n.parentId !== null).map(copy));
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.template_created',
      targetType: 'program_template',
      targetId: copyId,
      data: { kind: row.kind, copiedFrom: id },
      ip: meta.ip ?? null,
    });
    return copyId;
  });
  return reloadTemplate(db, actor, newId);
}

/** The node fields a copy keeps (never the legacy stage link). */
function copiedFields(n: repo.NodeRow) {
  return {
    nodeType: n.nodeType,
    title: n.title,
    body: n.body,
    contentLinks: n.contentLinks,
    sortOrder: n.sortOrder,
    isRequired: n.isRequired,
    isGate: n.isGate,
    expectedDays: n.expectedDays,
    isOpenEnded: n.isOpenEnded,
    dueOffsetDays: n.dueOffsetDays,
    submissionType: n.submissionType,
    checklistItems: n.checklistItems,
    milestoneTypeId: n.milestoneTypeId,
  };
}

/** POST /program-templates/:id/submit (M, own private published template). */
export async function submitTemplate(
  actor: Actor,
  id: string,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<TemplateDTO> {
  await db.transaction(async (tx) => {
    const { row } = await loadTemplate(tx, actor, id);
    if (actor.role !== 'mentor' || row.ownerId !== actor.userId) throw errors.forbidden();
    if (row.visibility !== 'private') throw errors.conflict(M.submitOnlyPrivate);
    if (row.status !== 'published') throw errors.conflict(M.submitNeedsPublished);
    await repo.updateTemplate(
      tx,
      id,
      { visibility: 'pending_approval', rejectionReason: null },
      new Date(),
    );
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.template_submitted',
      targetType: 'program_template',
      targetId: id,
      ip: meta.ip ?? null,
    });
  });
  return reloadTemplate(db, actor, id);
}

/** POST /program-templates/:id/approve or /reject (A): a mentor's template waiting for use. */
export async function decideTemplate(
  actor: Actor,
  id: string,
  decision: { approve: true } | { approve: false; reason: string },
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<TemplateDTO> {
  if (actor.role !== 'admin') throw errors.forbidden();
  await db.transaction(async (tx) => {
    const { row } = await loadTemplate(tx, actor, id);
    if (row.visibility !== 'pending_approval') throw errors.conflict(M.notPending);
    const now = new Date();
    await repo.updateTemplate(
      tx,
      id,
      decision.approve
        ? { visibility: 'organization', approvedBy: actor.userId, approvedAt: now }
        : { visibility: 'private', rejectionReason: decision.reason },
      now,
    );
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: decision.approve ? 'program.template_approved' : 'program.template_rejected',
      targetType: 'program_template',
      targetId: id,
      ip: meta.ip ?? null,
    });
  });
  return reloadTemplate(db, actor, id);
}

// ---- template nodes --------------------------------------------------------------------

const PHASE_ONLY = ['isGate', 'expectedDays', 'isOpenEnded'] as const;

function assertPhaseOnlyFields(nodeType: string, input: UpdateNodeInput): void {
  if (nodeType === 'phase') return;
  const fields: Record<string, string> = {};
  for (const key of PHASE_ONLY) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== false) fields[key] = M.phaseOnlyField;
  }
  if (Object.keys(fields).length) throw errors.validation(fields);
}

async function editTemplateContent<T>(
  db: Db,
  actor: Actor,
  templateId: string,
  change: (tx: DbOrTx, now: Date) => Promise<T>,
): Promise<TemplateDTO> {
  await db.transaction(async (tx) => {
    const { row, access } = await loadTemplate(tx, actor, templateId);
    assertEditable(row, access);
    await repo.lockTemplate(tx, actor.organizationId, templateId);
    const now = new Date();
    await change(tx, now);
    await repo.touchTemplate(tx, templateId, now);
  });
  return reloadTemplate(db, actor, templateId);
}

/** POST /program-templates/:id/nodes — added at the end of its level. */
export async function createNode(
  actor: Actor,
  templateId: string,
  input: CreateNodeInput,
  db: Db = getDb(),
): Promise<TemplateDTO> {
  return editTemplateContent(db, actor, templateId, async (tx, now) => {
    const parentId = input.parentId ?? null;
    if (input.nodeType === 'phase' && parentId) {
      throw errors.validation({ parentId: M.phaseAtTop });
    }
    if (input.nodeType !== 'phase') {
      const parent = parentId ? await repo.findTemplateNode(tx, templateId, parentId) : null;
      if (parent?.nodeType !== 'phase') {
        throw errors.validation({ parentId: M.parentNotPhase });
      }
    }
    assertPhaseOnlyFields(input.nodeType, input);
    const milestoneTypeId = input.nodeType === 'milestone' ? (input.milestoneTypeId ?? null) : null;
    await assertMilestoneType(tx, actor, milestoneTypeId);
    await repo.insertTemplateNodes(tx, [
      {
        templateId,
        parentId,
        nodeType: input.nodeType,
        title: input.title,
        body: input.body ?? null,
        contentLinks: input.contentLinks ?? [],
        sortOrder: (await repo.maxSortOrder(tx, templateId, parentId)) + 10,
        isRequired: input.isRequired ?? true,
        isGate: input.isGate ?? false,
        expectedDays: input.expectedDays ?? null,
        isOpenEnded: input.isOpenEnded ?? false,
        dueOffsetDays: input.dueOffsetDays ?? null,
        submissionType: input.nodeType === 'assignment' ? (input.submissionType ?? 'text') : null,
        checklistItems: input.checklistItems ?? [],
        milestoneTypeId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });
}

/** A milestone activity's type must be an active milestone type of the organization. */
async function assertMilestoneType(tx: DbOrTx, actor: Actor, id: string | null | undefined) {
  if (!id) return;
  await assertRefs(tx, actor, [
    { field: 'milestoneTypeId', kind: 'catalog', catalog: 'milestoneType', id },
  ]);
}

async function nodeOf(tx: DbOrTx, templateId: string, nodeId: string) {
  const node = isUuid(nodeId) ? await repo.findTemplateNode(tx, templateId, nodeId) : null;
  if (!node) throw errors.notFound();
  return node;
}

/** PATCH /program-templates/:id/nodes/:nodeId */
export async function updateNode(
  actor: Actor,
  templateId: string,
  nodeId: string,
  input: UpdateNodeInput,
  db: Db = getDb(),
): Promise<TemplateDTO> {
  return editTemplateContent(db, actor, templateId, async (tx, now) => {
    const node = await nodeOf(tx, templateId, nodeId);
    assertPhaseOnlyFields(node.nodeType, input);
    const values = { ...input };
    if (node.nodeType !== 'assignment') delete values.submissionType;
    if (node.nodeType !== 'milestone') delete values.milestoneTypeId;
    await assertMilestoneType(tx, actor, values.milestoneTypeId);
    await repo.updateTemplateNode(tx, nodeId, values, now);
  });
}

/** DELETE /program-templates/:id/nodes/:nodeId — a phase goes with its activities. */
export async function deleteNode(
  actor: Actor,
  templateId: string,
  nodeId: string,
  db: Db = getDb(),
): Promise<TemplateDTO> {
  return editTemplateContent(db, actor, templateId, async (tx) => {
    await nodeOf(tx, templateId, nodeId);
    await repo.deleteTemplateNode(tx, nodeId);
  });
}

/** PUT /program-templates/:id/nodes/order — exactly the siblings of one level (ADR-0004 1-1). */
export async function reorderNodes(
  actor: Actor,
  templateId: string,
  input: ReorderNodesInput,
  db: Db = getDb(),
): Promise<TemplateDTO> {
  return editTemplateContent(db, actor, templateId, async (tx, now) => {
    const siblings = await repo.siblingIds(tx, templateId, input.parentId);
    const given = new Set(input.nodeIds);
    if (given.size !== input.nodeIds.length || given.size !== siblings.length) {
      throw errors.validation({ nodeIds: M.orderMismatch });
    }
    if (!siblings.every((id) => given.has(id)))
      throw errors.validation({ nodeIds: M.orderMismatch });
    await repo.setNodeOrder(tx, input.nodeIds, now);
  });
}

// ---- runs ------------------------------------------------------------------------------

type RunContext = {
  row: repo.RunRow;
  staff: Awaited<ReturnType<typeof repo.listStaff>>;
  isStaff: boolean;
  access: 'view' | 'manage';
  mentees: SQL;
};

async function loadRun(db: DbOrTx, actor: Actor, id: string): Promise<RunContext> {
  assertStaff(actor);
  if (!isUuid(id)) throw errors.notFound();
  const row = await repo.findRun(db, actor.organizationId, id);
  if (!row) throw errors.notFound();
  const [staff, mentees] = await Promise.all([
    repo.listStaff(db, [id]),
    menteeCondition(db, actor),
  ]);
  const isStaff = staff.some((s) => s.userId === actor.userId);
  const hasMenteeInScope =
    actor.role === 'mentor' && !isStaff
      ? (await repo.listEnrollments(db, [id], mentees)).length > 0
      : false;
  const access = runAccess(actor, { isStaff, hasMenteeInScope });
  if (access === 'none') throw errors.notFound();
  return { row, staff, isStaff, access, mentees };
}

function toEnrollmentDTO(
  e: repo.EnrollmentRow,
  positions: Map<string, { title: string; position: number }>,
  now: Date,
  progress: ProgressDTO,
  usage: PackageUsageDTO,
): EnrollmentDTO {
  const phase = e.currentPhaseNodeId ? positions.get(e.currentPhaseNodeId) : undefined;
  return {
    id: e.id,
    student: { id: e.studentId, displayName: e.studentName },
    status: e.status,
    pausedUntil: e.pausedUntil,
    phase: phase && e.currentPhaseNodeId ? { id: e.currentPhaseNodeId, ...phase } : null,
    phaseEnteredAt: e.phaseEnteredAt?.toISOString() ?? null,
    daysInPhase: e.phaseEnteredAt ? daysSince(e.phaseEnteredAt, now) : null,
    sessionQuota: e.sessionQuota,
    validUntil: e.validUntil,
    enrolledAt: e.enrolledAt.toISOString(),
    progress,
    usage,
  };
}

function phasePositions(phases: Array<{ id: string; title: string }>) {
  return new Map(phases.map((p, i) => [p.id, { title: p.title, position: i + 1 }]));
}

function toRunSummary(
  row: repo.RunRow,
  staff: RunContext['staff'],
  visible: Array<{ status: EnrollmentStatus }>,
): RunSummaryDTO {
  return {
    id: row.id,
    kind: row.kind,
    mode: row.mode,
    title: row.title,
    status: row.status,
    isLegacy: row.legacyPathId !== null,
    template:
      row.templateId && row.templateTitle ? { id: row.templateId, title: row.templateTitle } : null,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    activeCount: visible.filter((e) => holdsSeat(e.status)).length,
    totalCount: visible.length,
    staff: staff.map((s) => ({ id: s.userId, displayName: s.displayName, role: s.role })),
  };
}

async function buildRunDTO(db: DbOrTx, actor: Actor, ctx: RunContext): Promise<RunDTO> {
  const { row } = ctx;
  const [nodes, list] = await Promise.all([
    repo.listRunNodes(db, row.id),
    repo.listEnrollments(db, [row.id], ctx.access === 'manage' ? undefined : ctx.mentees),
  ]);
  const occupied = new Set(list.map((e) => e.currentPhaseNodeId).filter((x) => x !== null));
  const phases = toPhases(nodes, occupied);
  const positions = phasePositions(phases);
  const now = new Date();
  const isLegacy = row.legacyPathId !== null;
  const manage = ctx.access === 'manage' && row.status !== 'archived';
  const isManager = ctx.staff.some((s) => s.userId === actor.userId && s.role === 'manager');
  const [progress, usage] = await Promise.all([
    loadProgress(
      db,
      list.map((e) => ({ id: e.id, runId: row.id, studentId: e.studentId })),
    ),
    loadUsage(db, actor.organizationId, list, now),
  ]);
  const assignments: RunDTO['assignments'] = {};
  for (const n of nodes) {
    if (n.nodeType !== 'assignment') continue;
    const own = list.map((e) => progress.get(e.id)?.tasks.get(n.id)).filter((x) => x !== undefined);
    assignments[n.id] = {
      assigned: own.length,
      accepted: own.filter((x) => x.status === 'accepted').length,
    };
  }
  const live = list.filter((e) => holdsSeat(e.status));
  return {
    ...toRunSummary(row, ctx.staff, list),
    templateRevision: row.templateRevision,
    phases,
    enrollments: list.map((e) =>
      toEnrollmentDTO(
        e,
        positions,
        now,
        progress.get(e.id)?.progress ?? NO_PROGRESS,
        usage.get(e.id) ?? NO_USAGE,
      ),
    ),
    averageProgress: averagePercent(live.map((e) => progress.get(e.id)?.progress ?? NO_PROGRESS)),
    assignments,
    can: {
      manage,
      manageStaff: manage && !isLegacy && (actor.role === 'admin' || isManager),
      enroll: manage && !isLegacy && isRunOpen(row.status),
    },
  };
}

/** GET /program-runs (A: all; M: runs they staff or that hold one of their mentees). */
export async function listRuns(
  actor: Actor,
  query: RunListQuery = {},
  db: DbOrTx = getDb(),
): Promise<RunSummaryDTO[]> {
  assertStaff(actor);
  const mentees = await menteeCondition(db, actor);
  const rows = await repo.listRuns(db, actor.organizationId, {
    status: query.status,
    ...(actor.role === 'mentor' ? { mentorId: actor.userId, menteeCondition: mentees } : {}),
  });
  const ids = rows.map((r) => r.id);
  const [staff, all] = await Promise.all([repo.listStaff(db, ids), repo.listEnrollments(db, ids)]);
  const scoped =
    actor.role === 'admin'
      ? null
      : new Set((await repo.listEnrollments(db, ids, mentees)).map((e) => e.id));
  return rows.map((r) => {
    const runStaff = staff.filter((s) => s.runId === r.id);
    const isStaff = runStaff.some((s) => s.userId === actor.userId);
    const visible = all.filter(
      (e) => e.runId === r.id && (scoped === null || isStaff || scoped.has(e.id)),
    );
    return toRunSummary(r, runStaff, visible);
  });
}

/**
 * Courses (open, non-legacy program runs the caller sees) with their phases in order: the
 * course and phase filter of the student list (sprint 5c).
 */
export async function listCourseOptions(
  actor: Actor,
  db: DbOrTx = getDb(),
): Promise<
  Array<{
    id: string;
    title: string;
    mode: RunMode;
    phases: Array<{ id: string; title: string }>;
  }>
> {
  const runs = (await listRuns(actor, {}, db)).filter(
    (r) => !r.isLegacy && r.kind === 'program' && (r.status === 'draft' || r.status === 'active'),
  );
  const phases = await runPhases(
    db,
    runs.map((r) => r.id),
  );
  return runs.map((r) => ({
    id: r.id,
    title: r.title,
    mode: r.mode,
    phases: (phases.get(r.id) ?? []).map((p) => ({ id: p.id, title: p.title })),
  }));
}

/**
 * Average known progress of the seated members per run (the organization dashboard, sprint 6).
 * The callers leave the main path out: it has no activities.
 */
export async function averageProgressByRun(
  db: DbOrTx,
  runIds: string[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!runIds.length) return out;
  const live = (await repo.listEnrollments(db, runIds)).filter((e) => holdsSeat(e.status));
  const progress = await loadProgress(
    db,
    live.map((e) => ({ id: e.id, runId: e.runId, studentId: e.studentId })),
  );
  for (const id of runIds) {
    out.set(
      id,
      averagePercent(
        live.filter((e) => e.runId === id).map((e) => progress.get(e.id)?.progress ?? NO_PROGRESS),
      ),
    );
  }
  return out;
}

/** GET /program-runs/:id */
export async function getRun(actor: Actor, id: string, db: DbOrTx = getDb()): Promise<RunDTO> {
  return buildRunDTO(db, actor, await loadRun(db, actor, id));
}

/**
 * POST /program-runs. From a template: copies its nodes (later template edits never reach the
 * run) and records the revision. A mentor creates individual runs only and joins the staff.
 */
export async function createRun(
  actor: Actor,
  input: CreateRunInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<RunDTO> {
  assertStaff(actor);
  if (
    actor.role === 'mentor' &&
    input.mode === 'group' &&
    !(await getAccessSettings(db, actor.organizationId)).mentorsCanCreateGroupRuns
  ) {
    throw new ApiError('FORBIDDEN', { message: M.groupNeedsAdmin });
  }
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    throw errors.validation({ endsOn: M.endsBeforeStart });
  }
  const runId = await db.transaction(async (tx) => {
    let template: repo.TemplateRow | null = null;
    if (input.templateId) {
      template = await repo.findTemplate(tx, actor.organizationId, input.templateId);
      if (!template || !canRunTemplate(actor, factsOf(template))) {
        throw errors.validation({ templateId: M.templateNotUsable });
      }
    } else if (input.kind !== 'one_on_one') {
      throw errors.validation({ templateId: M.noTemplateOneOnOne });
    }
    const kind = template?.kind ?? 'one_on_one';
    if (kind === 'one_on_one' && input.mode !== 'individual') {
      throw errors.validation({ mode: M.oneOnOneIndividual });
    }
    const now = new Date();
    const id = await repo.insertRun(tx, {
      organizationId: actor.organizationId,
      templateId: template?.id ?? null,
      kind,
      mode: input.mode,
      title: input.title,
      status: 'active',
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
      sourceLocale:
        template?.sourceLocale ??
        (await repo.organizationDefaults(tx, actor.organizationId)).locale,
      templateRevision: template?.revision ?? null,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    });
    if (template) {
      const nodes = await repo.listTemplateNodes(tx, template.id);
      const ids = new Map(nodes.map((n) => [n.id, uuidv7()]));
      const copy = (n: repo.NodeRow): typeof runNodes.$inferInsert => ({
        ...copiedFields(n),
        id: ids.get(n.id) as string,
        runId: id,
        sourceNodeId: n.id,
        parentId: n.parentId ? (ids.get(n.parentId) ?? null) : null,
        createdAt: now,
        updatedAt: now,
      });
      await repo.insertRunNodes(tx, nodes.filter((n) => n.parentId === null).map(copy));
      await repo.insertRunNodes(tx, nodes.filter((n) => n.parentId !== null).map(copy));
    }
    if (actor.role === 'mentor') {
      // A mentor's group run is theirs to manage; a one-person run they simply mentor.
      const role = input.mode === 'group' ? 'manager' : 'mentor';
      await repo.insertStaff(
        tx,
        { runId: id, userId: actor.userId, role, assignedBy: actor.userId },
        now,
      );
    }
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.run_created',
      targetType: 'program_run',
      targetId: id,
      data: { kind, mode: input.mode, templateId: template?.id ?? null },
      ip: meta.ip ?? null,
    });
    return id;
  });
  return getRun(actor, runId, db);
}

/** PATCH /program-runs/:id — title, dates and status (draft → active → completed, archive). */
export async function updateRun(
  actor: Actor,
  id: string,
  input: UpdateRunInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<RunDTO> {
  await db.transaction(async (tx) => {
    const ctx = await loadRun(tx, actor, id);
    if (ctx.access !== 'manage') throw errors.forbidden();
    const { row } = ctx;
    const isLegacy = row.legacyPathId !== null;
    if (
      isLegacy &&
      (input.status !== undefined || input.startsOn !== undefined || input.endsOn !== undefined)
    ) {
      throw errors.conflict(M.legacyRun);
    }
    if (row.status === 'archived') throw errors.conflict(M.runClosed);
    const startsOn = input.startsOn === undefined ? row.startsOn : input.startsOn;
    const endsOn = input.endsOn === undefined ? row.endsOn : input.endsOn;
    if (startsOn && endsOn && endsOn < startsOn) {
      throw errors.validation({ endsOn: M.endsBeforeStart });
    }
    if (
      input.status &&
      input.status !== row.status &&
      !canChangeRunStatus(row.status, input.status)
    ) {
      throw new ApiError('INVALID_TRANSITION', { message: M.runStatus });
    }
    await repo.lockRun(tx, id);
    await repo.updateRun(tx, id, input, new Date());
    if (input.status && input.status !== row.status) {
      await recordAudit(tx, {
        actorId: actor.userId,
        organizationId: actor.organizationId,
        action: 'program.run_status_changed',
        targetType: 'program_run',
        targetId: id,
        data: { from: row.status, to: input.status },
        ip: meta.ip ?? null,
      });
    }
  });
  return getRun(actor, id, db);
}

async function assertStaffManager(actor: Actor, ctx: RunContext): Promise<void> {
  if (ctx.row.legacyPathId !== null) throw errors.conflict(M.legacyRun);
  const isManager = ctx.staff.some((s) => s.userId === actor.userId && s.role === 'manager');
  if (ctx.access !== 'manage' || (actor.role !== 'admin' && !isManager)) throw errors.forbidden();
  if (ctx.row.status === 'archived') throw errors.conflict(M.runClosed);
}

/** POST /program-runs/:id/staff (A or the run's manager): a mentor or program manager. */
export async function addStaff(
  actor: Actor,
  runId: string,
  input: AddStaffInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<RunDTO> {
  await db.transaction(async (tx) => {
    const ctx = await loadRun(tx, actor, runId);
    await assertStaffManager(actor, ctx);
    if (!(await repo.isStaffMember(tx, actor.organizationId, input.userId))) {
      throw errors.validation({ userId: M.staffNotMember });
    }
    if (ctx.staff.some((s) => s.userId === input.userId)) throw errors.conflict(M.staffExists);
    await repo.lockRun(tx, runId);
    await repo.insertStaff(
      tx,
      { runId, userId: input.userId, role: input.role, assignedBy: actor.userId },
      new Date(),
    );
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.staff_added',
      targetType: 'program_run',
      targetId: runId,
      data: { userId: input.userId, role: input.role },
      ip: meta.ip ?? null,
    });
  });
  return getRun(actor, runId, db);
}

/** DELETE /program-runs/:id/staff/:userId — the row ends; history stays. */
export async function endStaff(
  actor: Actor,
  runId: string,
  userId: string,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<RunDTO> {
  await db.transaction(async (tx) => {
    const ctx = await loadRun(tx, actor, runId);
    await assertStaffManager(actor, ctx);
    if (!isUuid(userId) || !(await repo.endStaff(tx, runId, userId, new Date()))) {
      throw errors.notFound();
    }
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.staff_ended',
      targetType: 'program_run',
      targetId: runId,
      data: { userId },
      ip: meta.ip ?? null,
    });
  });
  return getRun(actor, runId, db);
}

// ---- enrollments -----------------------------------------------------------------------

/**
 * POST /program-runs/:id/enrollments — mentees of the actor's scope join at the first phase.
 * The package quota is copied and `valid_until` = today (organization time) + validity days.
 */
export async function enroll(
  actor: Actor,
  runId: string,
  input: EnrollInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
  /** CSV import into a course (sprint 6): a phase other than the first, per student. */
  opts: { startPhase?: ReadonlyMap<string, string> } = {},
): Promise<RunDTO> {
  await db.transaction(async (tx) => {
    const ctx = await loadRun(tx, actor, runId);
    if (ctx.row.legacyPathId !== null) throw errors.conflict(M.legacyRun);
    if (ctx.access !== 'manage') throw errors.forbidden();
    if (!isRunOpen(ctx.row.status)) throw errors.conflict(M.runClosed);
    await repo.lockRun(tx, runId);
    const wanted = [...new Set(input.studentIds)];
    const allowed = await repo.studentsInScope(tx, wanted, ctx.mentees);
    if (allowed.length !== wanted.length) throw errors.validation({ studentIds: INVALID });
    const existing = await repo.enrolledStudentIds(tx, runId);
    if (wanted.some((id) => existing.has(id))) throw errors.conflict(M.alreadyEnrolled);
    if (ctx.row.mode === 'individual' && (await repo.countSeats(tx, runId)) + wanted.length > 1) {
      throw errors.conflict(M.individualFull);
    }
    const template = ctx.row.templateId
      ? await repo.findTemplate(tx, actor.organizationId, ctx.row.templateId)
      : null;
    const nodes = await repo.listRunNodes(tx, runId);
    const first = nodes.find((n) => n.parentId === null) ?? null;
    const { timeZone } = await repo.organizationDefaults(tx, actor.organizationId);
    const now = new Date();
    const validUntil = template?.validityDays
      ? addDays(dayIn(timeZone, now), template.validityDays)
      : null;
    for (const studentId of wanted) {
      const startId = opts.startPhase?.get(studentId);
      const start = nodes.find((n) => n.parentId === null && n.id === startId) ?? first;
      const enrollmentId = await repo.insertEnrollment(tx, {
        runId,
        studentId,
        status: 'active',
        currentPhaseNodeId: start?.id ?? null,
        phaseEnteredAt: start ? now : null,
        sessionQuota: template?.sessionQuota ?? null,
        validUntil,
        enrolledBy: actor.userId,
        enrolledAt: now,
        updatedAt: now,
      });
      if (start) {
        await repo.insertEnrollmentTransition(
          tx,
          {
            enrollmentId,
            fromNodeId: null,
            toNodeId: start.id,
            kind: 'initial',
            note: null,
            actorId: actor.userId,
          },
          now,
        );
      }
    }
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.enrolled',
      targetType: 'program_run',
      targetId: runId,
      data: { count: wanted.length },
      ip: meta.ip ?? null,
    });
  });
  return getRun(actor, runId, db);
}

/**
 * An enrollment the actor may act on: admin; staff of its run; or a mentor whose mentee it
 * is (sprint-3 scope). Anything else is 404.
 */
async function loadEnrollment(db: DbOrTx, actor: Actor, id: string, lock = false) {
  assertStaff(actor);
  if (!isUuid(id)) throw errors.notFound();
  const row = await repo.findEnrollment(db, actor.organizationId, id, lock);
  if (!row) throw errors.notFound();
  const run = await repo.findRun(db, actor.organizationId, row.runId);
  if (!run) throw errors.notFound();
  if (actor.role !== 'admin') {
    const staff = await repo.listStaff(db, [run.id]);
    const isStaff = staff.some((s) => s.userId === actor.userId);
    if (!isStaff) {
      const mine = await repo.studentsInScope(
        db,
        [row.studentId],
        await menteeCondition(db, actor),
      );
      if (!mine.length) throw errors.notFound();
    }
  }
  return { row, run };
}

async function enrollmentDTO(db: DbOrTx, actor: Actor, id: string): Promise<EnrollmentDTO> {
  const { row, run } = await loadEnrollment(db, actor, id);
  const now = new Date();
  const [phases, progress, usage] = await Promise.all([
    repo.listPhases(db, [run.id]),
    loadProgress(db, [{ id: row.id, runId: run.id, studentId: row.studentId }]),
    loadUsage(db, actor.organizationId, [row], now),
  ]);
  return toEnrollmentDTO(
    row,
    phasePositions(phases),
    now,
    progress.get(row.id)?.progress ?? NO_PROGRESS,
    usage.get(row.id) ?? NO_USAGE,
  );
}

/** PATCH /enrollments/:id — pause (until a day), resume, complete, drop. */
export async function updateEnrollment(
  actor: Actor,
  id: string,
  input: UpdateEnrollmentInput,
  db: Db = getDb(),
): Promise<EnrollmentDTO> {
  await db.transaction(async (tx) => {
    const { row, run } = await loadEnrollment(tx, actor, id, true);
    if (run.legacyPathId !== null) throw errors.conflict(M.legacyRun);
    if (!isRunOpen(run.status)) throw errors.conflict(M.runClosed);
    if (row.status === input.status) return;
    if (!canChangeEnrollmentStatus(row.status, input.status)) {
      throw new ApiError('INVALID_TRANSITION', { message: M.enrollmentStatus });
    }
    if (input.status === 'paused' && !input.pausedUntil) {
      throw errors.validation({ pausedUntil: M.pausedUntilRequired });
    }
    const now = new Date();
    await repo.updateEnrollment(
      tx,
      id,
      {
        status: input.status,
        pausedUntil: input.status === 'paused' ? (input.pausedUntil ?? null) : null,
        completedAt: input.status === 'completed' ? now : null,
      },
      now,
    );
  });
  return enrollmentDTO(db, actor, id);
}

/**
 * PUT /enrollments/:id/phase — the same rules as a stage change (path/policy.ts) on the run's
 * phase order. In the legacy run the change goes through the 0.1 stage change.
 */
export async function changeEnrollmentPhase(
  actor: Actor,
  id: string,
  input: ChangePhaseInput,
  db: Db = getDb(),
): Promise<EnrollmentDTO> {
  const { row, run } = await loadEnrollment(db, actor, id);
  if (run.legacyPathId !== null) {
    const nodes = await repo.listRunNodes(db, run.id);
    const to = nodes.find((n) => n.id === input.toNodeId && n.parentId === null);
    if (!to?.legacyStageId) throw errors.validation({ toNodeId: INVALID });
    await changeStage(
      actor,
      row.studentId,
      { toStageId: to.legacyStageId, kind: input.kind, note: input.note ?? null },
      db,
    );
    return enrollmentDTO(db, actor, id);
  }
  await db.transaction(async (tx) => {
    const locked = await loadEnrollment(tx, actor, id, true);
    if (!isRunOpen(run.status)) throw errors.conflict(M.runClosed);
    const phases = await repo.listPhases(tx, [run.id]);
    if (!phases.length) throw errors.conflict(M.noPhase);
    const toIndex = phases.findIndex((p) => p.id === input.toNodeId);
    if (toIndex < 0) throw errors.validation({ toNodeId: INVALID });
    const fromId = locked.row.currentPhaseNodeId;
    const fromIndex = fromId ? phases.findIndex((p) => p.id === fromId) : -1;
    const check = checkTransition({
      kind: input.kind,
      fromSortOrder: fromIndex,
      toSortOrder: toIndex,
      sameStage: fromId === input.toNodeId,
      note: input.note,
    });
    if (check === 'same_stage') throw new ApiError('INVALID_TRANSITION', { message: M.samePhase });
    if (check === 'wrong_direction') {
      throw new ApiError('INVALID_TRANSITION', {
        message: input.kind === 'regress' ? M.backOnly : M.forwardOnly,
      });
    }
    if (check === 'note_required') throw errors.validation({ note: M.noteRequired });
    const now = new Date();
    await repo.insertEnrollmentTransition(
      tx,
      {
        enrollmentId: id,
        fromNodeId: fromId,
        toNodeId: input.toNodeId,
        kind: fromId ? input.kind : 'initial',
        note: input.note ?? null,
        actorId: actor.userId,
      },
      now,
    );
    await repo.updateEnrollment(
      tx,
      id,
      { currentPhaseNodeId: input.toNodeId, phaseEnteredAt: now },
      now,
    );
  });
  return enrollmentDTO(db, actor, id);
}

/** GET /students/:id/enrollments (A, M in scope): the student's runs, newest first. */
export async function listStudentEnrollments(
  actor: Actor,
  studentId: string,
  db: DbOrTx = getDb(),
): Promise<StudentEnrollmentDTO[]> {
  assertStaff(actor);
  await loadInScope(db, actor, 'student', studentId);
  const rows = await repo.listStudentEnrollments(db, actor.organizationId, studentId);
  const [phases, mentorRows, progress, usage] = await Promise.all([
    repo.listPhases(db, [...new Set(rows.map((r) => r.runId))]),
    repo.listEnrollmentMentors(
      db,
      rows.map((r) => r.id),
    ),
    loadProgress(
      db,
      rows.map((r) => ({ id: r.id, runId: r.runId, studentId })),
    ),
    loadUsage(db, actor.organizationId, rows, new Date()),
  ]);
  return rows.map((r) => {
    const own = phases.filter((p) => p.runId === r.runId);
    const index = own.findIndex((p) => p.id === r.currentPhaseNodeId);
    return {
      id: r.id,
      run: {
        id: r.runId,
        title: r.runTitle,
        kind: r.runKind,
        mode: r.runMode,
        isLegacy: r.legacyPathId !== null,
      },
      status: r.status,
      phase:
        index >= 0
          ? {
              id: own[index]?.id as string,
              title: own[index]?.title as string,
              position: index + 1,
              count: own.length,
            }
          : null,
      phases: own.map((p) => ({ id: p.id, title: p.title })),
      enrolledAt: r.enrolledAt.toISOString(),
      progress: progress.get(r.id)?.progress ?? NO_PROGRESS,
      usage: usage.get(r.id) ?? NO_USAGE,
      mentors: mentorRows
        .filter((m) => m.enrollmentId === r.id && m.endedAt === null)
        .map((m) => ({ id: m.userId, displayName: m.displayName, role: m.role })),
    };
  });
}

/**
 * GET /me/programs (mentee): every started run they are in (not dropped), with each phase's
 * state; activities of locked phases stay hidden.
 */
export async function getMyPrograms(actor: Actor, db: DbOrTx = getDb()): Promise<MyProgramDTO[]> {
  if (actor.role !== 'student') throw errors.forbidden();
  const rows = (
    await repo.listStudentEnrollments(db, actor.organizationId, actor.userId, [
      'active',
      'completed',
    ])
  ).filter((r) => r.status !== 'dropped');
  const [progress, usage] = await Promise.all([
    loadProgress(
      db,
      rows.map((r) => ({ id: r.id, runId: r.runId, studentId: actor.userId })),
    ),
    loadUsage(db, actor.organizationId, rows, new Date()),
  ]);
  return Promise.all(
    rows.map(async (r) => {
      const nodes = await repo.listRunNodes(db, r.runId);
      const detail = progress.get(r.id);
      const keep = new Set(r.currentPhaseNodeId ? [r.currentPhaseNodeId] : []);
      const phases = toPhases(nodes, keep);
      const current = phases.findIndex((p) => p.id === r.currentPhaseNodeId);
      return {
        enrollmentId: r.id,
        run: {
          id: r.runId,
          title: r.runTitle,
          kind: r.runKind,
          status: r.runStatus,
          isLegacy: r.legacyPathId !== null,
        },
        status: r.status,
        progress: detail?.progress ?? NO_PROGRESS,
        usage: usage.get(r.id) ?? NO_USAGE,
        phases: phases.map((p, i) => {
          const state = phaseState(i, current >= 0 ? current : null, r.status);
          return {
            id: p.id,
            title: p.title,
            body: p.body,
            contentLinks: p.contentLinks,
            state,
            activities:
              state === 'locked'
                ? []
                : p.activities.map((a) => ({
                    id: a.id,
                    nodeType: a.nodeType,
                    title: a.title,
                    body: a.body,
                    contentLinks: a.contentLinks,
                    checklistItems: a.checklistItems,
                    isRequired: a.isRequired,
                    done: detail ? isNodeDone(a, detail.facts) : false,
                    task: taskDTO(detail?.tasks.get(a.id)),
                    checklistState: [
                      ...(detail?.facts.completions.get(a.id)?.checklistState ?? []),
                    ],
                    canMark: studentMarkable(a),
                  })),
          };
        }),
      };
    }),
  );
}

// ---- assignments and progress (Coach Office sprint 5) ----------------------------------

const NO_PROGRESS: ProgressDTO = { done: 0, total: 0, percent: null };

type ProgressSubject = { id: string; runId: string; studentId: string };
type ProgramTask = { id: string; status: TaskStatus; dueAt: Date };
type ProgressDetail = {
  progress: ProgressDTO;
  facts: ProgressFacts;
  /** Live program task per activity. */
  tasks: Map<string, ProgramTask>;
};

/** The facts of progress.ts for each enrollment, in four queries. */
async function loadProgress(
  db: DbOrTx,
  subjects: readonly ProgressSubject[],
): Promise<Map<string, ProgressDetail>> {
  const out = new Map<string, ProgressDetail>();
  if (!subjects.length) return out;
  const ids = subjects.map((s) => s.id);
  const runIds = [...new Set(subjects.map((s) => s.runId))];
  const [activities, taskRows, completions, milestones, kinds, goalRows] = await Promise.all([
    repo.listActivities(db, runIds),
    repo.listProgramTasks(db, ids),
    repo.listCompletions(db, ids),
    repo.approvedMilestoneTypes(db, [...new Set(subjects.map((s) => s.studentId))]),
    repo.runKinds(db, runIds),
    repo.goalStatuses(db, ids),
  ]);
  const oneOnOne = new Set(kinds.filter((k) => k.kind === 'one_on_one').map((k) => k.id));
  for (const s of subjects) {
    const tasks = new Map(
      taskRows
        .filter((t) => t.enrollmentId === s.id)
        .map((t) => [t.nodeId, { id: t.id, status: t.status, dueAt: t.dueAt }]),
    );
    const facts: ProgressFacts = {
      acceptedNodeIds: new Set(
        [...tasks].filter(([, t]) => t.status === 'accepted').map(([nodeId]) => nodeId),
      ),
      completions: new Map(
        completions
          .filter((c) => c.enrollmentId === s.id)
          .map((c) => [
            c.runNodeId,
            { checklistState: c.checklistState, completedAt: c.completedAt },
          ]),
      ),
      approvedMilestoneTypeIds: new Set(
        milestones.filter((m) => m.studentId === s.studentId).map((m) => m.typeId),
      ),
    };
    const own = activities.filter((a) => a.runId === s.runId);
    // One-on-one mentoring is measured by its goals (ADR-0012 section 6, sprint 5b).
    const progress = oneOnOne.has(s.runId)
      ? goalProgress(goalRows.filter((g) => g.enrollmentId === s.id).map((g) => g.status))
      : computeProgress(own, facts);
    out.set(s.id, { progress, facts, tasks });
  }
  return out;
}

const NO_USAGE: PackageUsageDTO = {
  quota: null,
  used: 0,
  remaining: null,
  validUntil: null,
  daysLeft: null,
  overQuota: false,
  expired: false,
};

/** Package use of each enrollment, counted on the organization's calendar. */
async function loadUsage(
  db: DbOrTx,
  organizationId: string,
  rows: ReadonlyArray<{ id: string; sessionQuota: number | null; validUntil: string | null }>,
  now: Date,
): Promise<Map<string, PackageUsageDTO>> {
  const out = new Map<string, PackageUsageDTO>();
  if (!rows.length) return out;
  const [{ timeZone }, sessions] = await Promise.all([
    repo.organizationDefaults(db, organizationId),
    repo.usageSessions(
      db,
      rows.map((r) => r.id),
    ),
  ]);
  const today = dayIn(timeZone, now);
  for (const r of rows) {
    out.set(
      r.id,
      packageUsage({
        quota: r.sessionQuota,
        validUntil: r.validUntil,
        sessions: sessions.filter((s) => s.enrollmentId === r.id),
        today,
      }),
    );
  }
  return out;
}

// ---- for the mentoring module (sprint 5b) ---------------------------------------------

/** An enrollment staff may act on (admin, run staff, the mentee's mentor) and its run; else 404. */
export async function enrollmentForStaff(db: DbOrTx, actor: Actor, id: string, lock = false) {
  return loadEnrollment(db, actor, id, lock);
}

/** A run the actor may see (else 404); `manage` when they may also run it. */
export async function runForStaff(db: DbOrTx, actor: Actor, id: string) {
  const ctx = await loadRun(db, actor, id);
  return { run: ctx.row, manage: ctx.access === 'manage', staff: ctx.staff };
}

/** Default mentor of an enrollment's session: its primary mentor, else a mentor of the run. */
export async function defaultMentorOf(
  db: DbOrTx,
  enrollmentId: string,
  runId: string,
): Promise<string | null> {
  const [mentors, staff] = await Promise.all([
    repo.listEnrollmentMentors(db, [enrollmentId]),
    repo.listStaff(db, [runId]),
  ]);
  return reviewerFor(enrollmentId, mentors, staff);
}

/** The organization's time zone (sessions are entered and shown in it). */
export async function organizationTimeZone(db: DbOrTx, organizationId: string): Promise<string> {
  return (await repo.organizationDefaults(db, organizationId)).timeZone;
}

/** Whether a user is active staff (owner, admin or mentor) of the organization. */
export async function isActiveStaff(
  db: DbOrTx,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  return repo.isStaffMember(db, organizationId, userId);
}

function taskDTO(task: ProgramTask | undefined) {
  return task ? { id: task.id, status: task.status, dueAt: task.dueAt.toISOString() } : null;
}

/** The mentee marks lessons, resources and checklists; a milestone is never theirs to mark. */
function studentMarkable(node: { nodeType: string }): boolean {
  return (
    node.nodeType === 'lesson' || node.nodeType === 'resource' || node.nodeType === 'checklist'
  );
}

/** Default reviewer of an enrollment's task: its primary mentor, else a mentor of the run. */
function reviewerFor(
  enrollmentId: string,
  mentors: repo.EnrollmentMentorRow[],
  staff: RunContext['staff'],
): string | null {
  const primary = mentors.find(
    (m) => m.enrollmentId === enrollmentId && m.role === 'primary' && m.endedAt === null,
  );
  return (
    primary?.userId ?? staff.find((s) => s.role === 'mentor')?.userId ?? staff[0]?.userId ?? null
  );
}

/**
 * POST /program-runs/:id/nodes/:nodeId/assign (A; staff of the run): a task from an
 * assignment activity for every active or paused member without a live one. The deadline is
 * relative to the start of the run (or `dueDate`); the reviewer is each member's primary
 * mentor. Legacy runs keep their 0.1 tasks (409).
 */
export async function assignNodeToRun(
  actor: Actor,
  runId: string,
  nodeId: string,
  input: AssignNodeInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<AssignNodeResultDTO> {
  const result = await db.transaction(async (tx) => {
    const ctx = await loadRun(tx, actor, runId);
    if (ctx.row.legacyPathId !== null) throw errors.conflict(M.legacyRun);
    if (ctx.access !== 'manage') throw errors.forbidden();
    if (!isRunOpen(ctx.row.status)) throw errors.conflict(M.runClosed);
    await repo.lockRun(tx, runId);
    const node = isUuid(nodeId) ? await repo.findRunNode(tx, runId, nodeId) : null;
    if (!node) throw errors.notFound();
    if (node.nodeType !== 'assignment') throw errors.validation({ nodeId: M.notAssignment });
    const members = (await repo.listEnrollments(tx, [runId])).filter((e) => holdsSeat(e.status));
    const existing = await repo.listProgramTasks(
      tx,
      members.map((e) => e.id),
    );
    const has = new Set(existing.filter((t) => t.nodeId === nodeId).map((t) => t.enrollmentId));
    const todo = members.filter((e) => !has.has(e.id));
    const now = new Date();
    let dueDay = input.dueDate;
    if (!dueDay) {
      const [{ timeZone }, settings, nodes] = await Promise.all([
        repo.organizationDefaults(tx, actor.organizationId),
        getTasksSettings(tx, actor.organizationId),
        repo.listRunNodes(tx, runId),
      ]);
      dueDay = assignmentDueDay({
        runStartsOn: ctx.row.startsOn,
        phases: nodes.filter((n) => n.parentId === null),
        phaseId: node.parentId ?? '',
        dueOffsetDays: node.dueOffsetDays,
        fallbackDays: settings.defaultDueDays,
        today: dayIn(timeZone, now),
      });
    }
    const mentors = await repo.listEnrollmentMentors(
      tx,
      todo.map((e) => e.id),
    );
    const targets: ProgramTaskTarget[] = todo.map((e) => ({
      studentId: e.studentId,
      enrollmentId: e.id,
      nodeId,
      reviewerId: reviewerFor(e.id, mentors, ctx.staff),
    }));
    const taskIds = await insertProgramTasks(
      tx,
      actor,
      {
        title: node.title,
        description: node.body,
        submissionType: node.submissionType ?? 'text',
        dueDay,
      },
      targets,
      now,
    );
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.activity_assigned',
      targetType: 'program_run',
      targetId: runId,
      data: { nodeId, created: taskIds.length, skipped: members.length - todo.length },
      ip: meta.ip ?? null,
    });
    return {
      created: taskIds.length,
      skipped: members.length - todo.length,
      taskIds,
      studentIds: targets.map((t) => t.studentId),
    };
  });
  await recomputeHealthSafe(result.studentIds, db);
  return { created: result.created, skipped: result.skipped, taskIds: result.taskIds };
}

/**
 * PUT /enrollments/:id/nodes/:nodeId/completion. The mentee marks lessons, resources and
 * checklists of their passed and current phases (own active or paused enrollment); staff who
 * reach the enrollment mark those and type-less milestones too. Assignments are done by their
 * accepted task, typed milestones by the milestone (422).
 */
export async function setNodeCompletion(
  actor: Actor,
  enrollmentId: string,
  nodeId: string,
  input: NodeCompletionInput,
  db: Db = getDb(),
): Promise<ProgressDTO> {
  const { row } = await db.transaction(async (tx) => {
    let row: repo.EnrollmentRow;
    let runId: string;
    if (actor.role === 'student') {
      const found = isUuid(enrollmentId)
        ? await repo.findEnrollment(tx, actor.organizationId, enrollmentId, true)
        : null;
      if (!found || found.studentId !== actor.userId) throw errors.notFound();
      if (!holdsSeat(found.status)) throw errors.conflict(M.enrollmentStatus);
      row = found;
      runId = found.runId;
    } else {
      const loaded = await loadEnrollment(tx, actor, enrollmentId, true);
      row = loaded.row;
      runId = loaded.run.id;
    }
    const node = isUuid(nodeId) ? await repo.findRunNode(tx, runId, nodeId) : null;
    if (!node || node.nodeType === 'phase') throw errors.notFound();
    const staffOnly = node.nodeType === 'milestone' && node.milestoneTypeId === null;
    if (!studentMarkable(node) && !(staffOnly && actor.role !== 'student')) {
      throw errors.validation({ nodeId: M.notMarkable });
    }
    if (actor.role === 'student') {
      const phases = (await repo.listRunNodes(tx, runId)).filter((n) => n.parentId === null);
      const current = phases.findIndex((p) => p.id === row.currentPhaseNodeId);
      const index = phases.findIndex((p) => p.id === node.parentId);
      if (phaseState(index, current >= 0 ? current : null, row.status) === 'locked') {
        throw errors.conflict(M.activityLocked);
      }
    }
    let checklistState: boolean[] = [];
    let done: boolean;
    if (node.nodeType === 'checklist' && node.checklistItems.length > 0) {
      if (input.checklist !== undefined) {
        if (input.checklist.length !== node.checklistItems.length) {
          throw errors.validation({ checklist: M.checklistMismatch });
        }
        checklistState = input.checklist;
      } else if (input.done !== undefined) {
        checklistState = node.checklistItems.map(() => input.done === true);
      } else {
        throw errors.validation({ done: INVALID });
      }
      done = checklistState.every(Boolean);
    } else {
      if (input.done === undefined) throw errors.validation({ done: INVALID });
      done = input.done;
    }
    const now = new Date();
    await repo.upsertCompletion(
      tx,
      {
        enrollmentId: row.id,
        runNodeId: node.id,
        checklistState,
        completedAt: done ? now : null,
        updatedBy: actor.userId,
      },
      now,
    );
    return { row };
  });
  const progress = await loadProgress(db, [
    { id: row.id, runId: row.runId, studentId: row.studentId },
  ]);
  return progress.get(row.id)?.progress ?? NO_PROGRESS;
}

// ---- enrollment mentors (sprint 4) -----------------------------------------------------

function toEnrollmentMentorDTO(r: repo.EnrollmentMentorRow): EnrollmentMentorDTO {
  return {
    id: r.id,
    user: { id: r.userId, displayName: r.displayName },
    role: r.role,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    assignedBy:
      r.assignedById && r.assignedByName
        ? { id: r.assignedById, displayName: r.assignedByName }
        : null,
    reason: r.reason,
  };
}

/** GET /enrollments/:id/mentors (A; staff who may see the enrollment). */
export async function listEnrollmentMentors(
  actor: Actor,
  enrollmentId: string,
  db: DbOrTx = getDb(),
): Promise<EnrollmentMentorsDTO> {
  const { row, run } = await loadEnrollment(db, actor, enrollmentId);
  const rows = await repo.listEnrollmentMentors(db, [row.id]);
  return {
    enrollmentId: row.id,
    studentId: row.studentId,
    isLegacy: run.legacyPathId !== null,
    active: rows.filter((r) => r.endedAt === null).map(toEnrollmentMentorDTO),
    history: rows.filter((r) => r.endedAt !== null).map(toEnrollmentMentorDTO),
  };
}

function assertAdmin(actor: Actor): void {
  if (actor.role !== 'admin') throw errors.forbidden();
}

/**
 * POST /enrollments/:id/mentors (A): a secondary mentor joins; a primary replaces the current
 * primary (transfer). On the legacy run the primary is `students.primary_mentor_id`, so it goes
 * through students.changeMentor (open questions and reminders follow) and the database trigger
 * mirrors it here.
 */
export async function assignEnrollmentMentor(
  actor: Actor,
  enrollmentId: string,
  input: AssignEnrollmentMentorInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<EnrollmentMentorsDTO> {
  assertAdmin(actor);
  const { row, run } = await loadEnrollment(db, actor, enrollmentId);
  await assertRefs(db, actor, [{ field: 'mentorId', kind: 'staffUser', id: input.mentorId }]);
  if (run.legacyPathId !== null && input.role === 'primary') {
    await changeMentor(
      actor,
      row.studentId,
      { mentorId: input.mentorId, reason: input.reason ?? null },
      meta,
      db,
    );
    return listEnrollmentMentors(actor, enrollmentId, db);
  }
  await db.transaction(async (tx) => {
    await repo.findEnrollment(tx, actor.organizationId, row.id, true);
    const active = (await repo.listEnrollmentMentors(tx, [row.id])).filter(
      (r) => r.endedAt === null,
    );
    const current = active.find((r) => r.userId === input.mentorId);
    if (current?.role === input.role) throw errors.conflict(M.mentorExists);
    if (current?.role === 'primary') throw errors.conflict(M.mentorIsPrimary);
    const now = new Date();
    const previous = active.find((r) => r.role === 'primary')?.userId ?? null;
    if (input.role === 'primary') {
      await repo.endEnrollmentMentors(tx, row.id, { role: 'primary' }, now);
      // A secondary who becomes primary ends their secondary row.
      if (current) await repo.endEnrollmentMentors(tx, row.id, { userId: input.mentorId }, now);
    }
    await repo.insertEnrollmentMentor(
      tx,
      {
        enrollmentId: row.id,
        userId: input.mentorId,
        role: input.role,
        assignedBy: actor.userId,
        reason: input.reason ?? null,
      },
      now,
    );
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.mentor_assigned',
      targetType: 'enrollment',
      targetId: row.id,
      data: {
        mentorId: input.mentorId,
        role: input.role,
        fromMentorId: input.role === 'primary' ? previous : null,
      },
      ip: meta.ip ?? null,
    });
  });
  return listEnrollmentMentors(actor, enrollmentId, db);
}

/** DELETE /enrollments/:id/mentors/:userId (A): the row ends; history stays. */
export async function endEnrollmentMentor(
  actor: Actor,
  enrollmentId: string,
  mentorId: string,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<EnrollmentMentorsDTO> {
  assertAdmin(actor);
  const { row, run } = await loadEnrollment(db, actor, enrollmentId);
  if (!isUuid(mentorId)) throw errors.notFound();
  const active = (await repo.listEnrollmentMentors(db, [row.id])).filter(
    (r) => r.endedAt === null && r.userId === mentorId,
  );
  if (!active.length) throw errors.notFound();
  if (run.legacyPathId !== null && active.some((r) => r.role === 'primary')) {
    await changeMentor(actor, row.studentId, { mentorId: null }, meta, db);
    return listEnrollmentMentors(actor, enrollmentId, db);
  }
  await db.transaction(async (tx) => {
    const ended = await repo.endEnrollmentMentors(tx, row.id, { userId: mentorId }, new Date());
    if (!ended.length) throw errors.notFound();
    await recordAudit(tx, {
      actorId: actor.userId,
      organizationId: actor.organizationId,
      action: 'program.mentor_ended',
      targetType: 'enrollment',
      targetId: row.id,
      data: { mentorId, role: ended[0]?.role },
      ip: meta.ip ?? null,
    });
  });
  return listEnrollmentMentors(actor, enrollmentId, db);
}

/**
 * Internal (mentors.transferStudents): every active primary enrollment of `fromId` moves to
 * `toId`, one enrollment at a time. Secondary rows and run staff stay.
 */
export async function transferPrimaryEnrollments(
  actor: Actor,
  fromId: string,
  toId: string,
  reason: string | null,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<number> {
  assertAdmin(actor);
  const rows = await repo.activePrimaryEnrollmentsOf(db, actor.organizationId, fromId);
  for (const r of rows) {
    await assignEnrollmentMentor(
      actor,
      r.enrollmentId,
      { mentorId: toId, role: 'primary', reason: reason ?? undefined },
      meta,
      db,
    );
  }
  return rows.length;
}
