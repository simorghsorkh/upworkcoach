import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { logger, safeError } from '@/server/logger';
import { recordAudit } from '../admin/service';
import {
  type AccessSettings,
  accessSettingsSchema,
  type BusinessHoursSettings,
  businessHoursSchema,
  type CannedResponseDTO,
  type CheckinSettings,
  type CreateCannedResponseInput,
  type CreateMilestoneTypeInput,
  type CreatePlatformInput,
  type CreateStageInput,
  type CreateTaskTemplateInput,
  checkinSettingsSchema,
  type HealthRules,
  healthRulesSchema,
  type ListTaskTemplatesQuery,
  type MilestoneTypeDTO,
  type PlatformDTO,
  type PublicSettingsDTO,
  type QuestionsSettings,
  questionsSettingsSchema,
  SETTINGS_DEFAULTS,
  SETTINGS_KEYS,
  SETTINGS_SCHEMAS,
  type SettingEntryDTO,
  type SettingsDTO,
  type SettingsKey,
  type SettingsValues,
  type SlaSettings,
  type StaffSettingsDTO,
  type StageDTO,
  slaSettingsSchema,
  type TasksSettings,
  type TaskTemplateDTO,
  type TrackDTO,
  tasksSettingsSchema,
  type UpdateCannedResponseInput,
  type UpdateMilestoneTypeInput,
  type UpdatePlatformInput,
  type UpdateSettingsInput,
  type UpdateStageInput,
  type UpdateTaskTemplateInput,
} from './contracts';
import * as repo from './repo';

/**
 * catalog — settings, tracks, platforms and stages (data-model.md 2-2, api.md 5 and 13).
 * Public functions take `actor` first (ADR-0004) and are safe to call from RSC pages.
 * Internal helpers (no actor) are for other modules' services only and take the
 * organization explicitly: catalog rows and settings are per organization (ADR-0011).
 */

/** Only the client IP is needed for audit rows (from `getClientIp`, ADR-0003). */
export type AuditMeta = { ip?: string | null };

const NAME_TAKEN = 'پلتفرمی با این نام هست.';

function assertAdmin(actor: Actor): void {
  if (actor.role !== 'admin') throw errors.forbidden();
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

// ---- settings --------------------------------------------------------------------------

/**
 * A missing or invalid row falls back to the default (logged), so a bad value can never
 * widen access (the default is the narrowest scope).
 */
export async function getAccessSettings(db: DbOrTx, org: string): Promise<AccessSettings> {
  const value = await repo.findSettingValue(db, org, 'access');
  if (value === undefined) return SETTINGS_DEFAULTS.access;
  const parsed = accessSettingsSchema.safeParse(value);
  if (!parsed.success) {
    logger.error(
      { event: 'settings.invalid', key: 'access' },
      'invalid settings value; using default',
    );
    return SETTINGS_DEFAULTS.access;
  }
  return parsed.data;
}

/** Internal write used by tests and, later, by the settings endpoint (which also audits). */
export async function putAccessSettings(
  db: DbOrTx,
  org: string,
  value: AccessSettings,
  updatedBy: string | null,
): Promise<void> {
  const parsed = accessSettingsSchema.parse(value);
  await repo.writeSetting(db, org, 'access', parsed, updatedBy, new Date());
}

// ---- tracks ----------------------------------------------------------------------------

/** GET /tracks — every signed-in role; inactive rows only for admins who ask. */
export async function listTracks(
  actor: Actor,
  options: { includeInactive?: boolean } = {},
  db: DbOrTx = getDb(),
): Promise<TrackDTO[]> {
  const rows = await repo.listTracks(
    db,
    actor.organizationId,
    actor.role === 'admin' && options.includeInactive === true,
  );
  return rows.map((r) => ({ ...r }));
}

// ---- platforms -------------------------------------------------------------------------

/** GET /platforms — every signed-in role; inactive rows only for admins who ask. */
export async function listPlatforms(
  actor: Actor,
  options: { includeInactive?: boolean } = {},
  db: DbOrTx = getDb(),
): Promise<PlatformDTO[]> {
  const rows = await repo.listPlatforms(
    db,
    actor.organizationId,
    actor.role === 'admin' && options.includeInactive === true,
  );
  return rows.map((r) => ({ ...r }));
}

async function assertTrackRef(
  db: DbOrTx,
  org: string,
  trackId: string | null | undefined,
): Promise<void> {
  if (!trackId) return;
  if (!isUuid(trackId) || !(await repo.isActiveRef(db, org, 'track', trackId))) {
    throw errors.validation({ trackId: 'مقدار نامعتبر است' });
  }
}

/** POST /platforms (admin): a new platform without a code change (F2). */
export async function createPlatform(
  actor: Actor,
  input: CreatePlatformInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<PlatformDTO> {
  assertAdmin(actor);
  try {
    return await db.transaction(async (tx) => {
      const org = actor.organizationId;
      await assertTrackRef(tx, org, input.trackId);
      if (await repo.findPlatformByName(tx, org, input.name)) {
        throw errors.validation({ name: NAME_TAKEN });
      }
      const row = await repo.insertPlatform(tx, org, {
        name: input.name,
        trackId: input.trackId ?? null,
        sortOrder: input.sortOrder ?? (await repo.maxPlatformSortOrder(tx, org)) + 10,
        isActive: input.isActive ?? true,
      });
      await recordAudit(tx, {
        actorId: actor.userId,
        action: 'catalog.platform_created',
        targetType: 'platform',
        targetId: row.id,
        data: { name: row.name },
        ip: meta.ip ?? null,
      });
      return { ...row };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw errors.validation({ name: NAME_TAKEN });
    throw err;
  }
}

/** PATCH /platforms/:id (admin). Deactivated platforms keep existing data. */
export async function updatePlatform(
  actor: Actor,
  platformId: string,
  input: UpdatePlatformInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<PlatformDTO> {
  assertAdmin(actor);
  if (!isUuid(platformId)) throw errors.notFound();
  try {
    return await db.transaction(async (tx) => {
      const org = actor.organizationId;
      const current = await repo.findPlatform(tx, org, platformId);
      if (!current) throw errors.notFound();
      await assertTrackRef(tx, org, input.trackId);
      if (input.name !== undefined) {
        const other = await repo.findPlatformByName(tx, org, input.name);
        if (other && other.id !== platformId) throw errors.validation({ name: NAME_TAKEN });
      }
      const row = await repo.updatePlatform(tx, org, platformId, input);
      if (!row) throw errors.notFound();
      await recordAudit(tx, {
        actorId: actor.userId,
        action: 'catalog.platform_updated',
        targetType: 'platform',
        targetId: platformId,
        data: { fields: Object.keys(input) },
        ip: meta.ip ?? null,
      });
      return { ...row };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw errors.validation({ name: NAME_TAKEN });
    throw err;
  }
}

// ---- stages ----------------------------------------------------------------------------

export function toStageDTO(row: repo.StageRow): StageDTO {
  return {
    id: row.id,
    displayCode: row.displayCode,
    name: row.name,
    sortOrder: row.sortOrder,
    expectedDays: row.expectedDays,
    isOpenEnded: row.isOpenEnded,
    studentDescription: row.studentDescription,
    contentLinks: row.contentLinks.map((l) => ({ title: l.title, url: l.url })),
    isActive: row.isActive,
  };
}

async function defaultPathId(db: DbOrTx, org: string): Promise<string> {
  const id = await repo.findDefaultPathId(db, org);
  // The seed (pnpm db:migrate, org:create) always creates it; missing = operator error.
  if (!id) throw new Error('catalog: no default learning path (run `pnpm db:seed`)');
  return id;
}

/** GET /stages — every signed-in role; inactive stages only for admins who ask. */
export async function listStages(
  actor: Actor,
  options: { includeInactive?: boolean } = {},
  db: DbOrTx = getDb(),
): Promise<StageDTO[]> {
  const rows = await repo.listStages(
    db,
    await defaultPathId(db, actor.organizationId),
    actor.role === 'admin' && options.includeInactive === true,
  );
  return rows.map(toStageDTO);
}

/** POST /stages (admin). Without `sortOrder` the stage goes to the end of the path. */
export async function createStage(
  actor: Actor,
  input: CreateStageInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<StageDTO> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const pathId = await defaultPathId(tx, actor.organizationId);
    await repo.lockPath(tx, pathId);
    const row = await repo.insertStage(tx, pathId, {
      displayCode: input.displayCode,
      name: input.name,
      sortOrder: input.sortOrder ?? (await repo.maxStageSortOrder(tx, pathId)) + 10,
      expectedDays: input.expectedDays ?? null,
      isOpenEnded: input.isOpenEnded ?? false,
      studentDescription: input.studentDescription ?? null,
      contentLinks: input.contentLinks ?? [],
      isActive: input.isActive ?? true,
    });
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'catalog.stage_created',
      targetType: 'stage',
      targetId: row.id,
      data: { name: row.name },
      ip: meta.ip ?? null,
    });
    return toStageDTO(row);
  });
}

/**
 * PATCH /stages/:id (admin). Changing `expectedDays` or `isOpenEnded` runs an immediate
 * `health.sweep` after the commit (api.md section 5, ADR-0005), best-effort.
 */
export async function updateStage(
  actor: Actor,
  stageId: string,
  input: UpdateStageInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<StageDTO> {
  assertAdmin(actor);
  if (!isUuid(stageId)) throw errors.notFound();
  const result = await db.transaction(async (tx) => {
    if (!(await repo.findStage(tx, actor.organizationId, stageId))) throw errors.notFound();
    const row = await repo.updateStage(tx, actor.organizationId, stageId, input);
    if (!row) throw errors.notFound();
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'catalog.stage_updated',
      targetType: 'stage',
      targetId: stageId,
      data: { fields: Object.keys(input) },
      ip: meta.ip ?? null,
    });
    return toStageDTO(row);
  });
  if (input.expectedDays !== undefined || input.isOpenEnded !== undefined) {
    await runHealthSweep(db, actor.organizationId, 'stage.updated');
  }
  return result;
}

/**
 * Immediate `health.sweep` after a change of thresholds (ADR-0005). Loaded lazily: the
 * health module reads its settings from this one (no static import cycle). Best-effort: a
 * failure is logged and the hourly sweep repairs it.
 */
async function runHealthSweep(db: Db, org: string, reason: string): Promise<void> {
  try {
    const { sweepAllHealth } = await import('../health/recompute');
    await sweepAllHealth(db, org);
  } catch (err) {
    logger.error(
      { event: 'health.sweep_failed', reason, error: safeError(err) },
      'immediate health sweep failed; the hourly sweep will retry',
    );
  }
}

/**
 * PUT /stages/order (admin): `stageIds` must be exactly the full set of stages of the path
 * (active and inactive), otherwise 422 (ADR-0004 1-1). One transaction.
 */
export async function reorderStages(
  actor: Actor,
  input: { stageIds: string[] },
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<StageDTO[]> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const pathId = await defaultPathId(tx, actor.organizationId);
    await repo.lockPath(tx, pathId);
    const all = await repo.listStages(tx, pathId, true);
    const unique = new Set(input.stageIds);
    const sameSet =
      unique.size === input.stageIds.length &&
      unique.size === all.length &&
      all.every((s) => unique.has(s.id));
    if (!sameSet) throw errors.validation({ stageIds: 'مقدار نامعتبر است' });
    for (const [index, id] of input.stageIds.entries()) {
      await repo.updateStage(tx, actor.organizationId, id, { sortOrder: (index + 1) * 10 });
    }
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'catalog.stages_reordered',
      targetType: 'stage',
      data: { count: input.stageIds.length },
      ip: meta.ip ?? null,
    });
    return (await repo.listStages(tx, pathId, true)).map(toStageDTO);
  });
}

// ---- internal helpers for other modules (no actor) -----------------------------------

export type StageInfo = repo.StageRow;

/** First active stage of the default path (default stage of a new student). */
export async function getFirstActiveStage(db: DbOrTx, org: string): Promise<StageInfo> {
  const [first] = await repo.listStages(db, await defaultPathId(db, org), false);
  if (!first) throw errors.conflict('هیچ مرحله‌ی فعالی تعریف نشده است.');
  return first;
}

/** All stages of the default path in path order (`includeInactive` for history views). */
export async function getPathStages(
  db: DbOrTx,
  org: string,
  includeInactive: boolean,
): Promise<StageInfo[]> {
  return repo.listStages(db, await defaultPathId(db, org), includeInactive);
}

export async function getStage(
  db: DbOrTx,
  org: string,
  stageId: string,
): Promise<StageInfo | null> {
  return isUuid(stageId) ? repo.findStage(db, org, stageId) : null;
}

export async function getStages(
  db: DbOrTx,
  org: string,
  ids: readonly string[],
): Promise<StageInfo[]> {
  return repo.findStages(db, org, ids.filter(isUuid));
}

export async function getTrack(db: DbOrTx, org: string, id: string) {
  return isUuid(id) ? repo.findTrack(db, org, id) : null;
}

export async function getPlatform(db: DbOrTx, org: string, id: string) {
  return isUuid(id) ? repo.findPlatform(db, org, id) : null;
}

/** Internal: deactivates a stage. The caller (path.service) checks for active students. */
export async function setStageInactive(
  tx: DbOrTx,
  actor: Actor,
  stageId: string,
  meta: AuditMeta,
): Promise<StageDTO> {
  const row = await repo.updateStage(tx, actor.organizationId, stageId, { isActive: false });
  if (!row) throw errors.notFound();
  await recordAudit(tx, {
    actorId: actor.userId,
    action: 'catalog.stage_deactivated',
    targetType: 'stage',
    targetId: stageId,
    ip: meta.ip ?? null,
  });
  return toStageDTO(row);
}

/** access.assertRefs: the row exists and is active. */
export async function isActiveCatalogRef(
  db: DbOrTx,
  org: string,
  kind: repo.CatalogRefKind,
  id: string,
): Promise<boolean> {
  return isUuid(id) && repo.isActiveRef(db, org, kind, id);
}

export type { CatalogRefKind } from './repo';

// ---- other settings keys (data-model.md 2-2) -----------------------------------------

async function readSetting<T>(
  db: DbOrTx,
  org: string,
  key: string,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  fallback: T,
): Promise<T> {
  const value = await repo.findSettingValue(db, org, key);
  if (value === undefined) return fallback;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    logger.error({ event: 'settings.invalid', key }, 'invalid settings value; using default');
    return fallback;
  }
  return parsed.data;
}

/** `sla` thresholds (hours) and clock (business / calendar; decision E6 = business). */
export async function getSlaSettings(db: DbOrTx, org: string): Promise<SlaSettings> {
  return readSetting(db, org, 'sla', slaSettingsSchema, SETTINGS_DEFAULTS.sla);
}

/** `business_hours` (Tehran; holidays as Tehran days). */
export async function getBusinessHours(db: DbOrTx, org: string): Promise<BusinessHoursSettings> {
  return readSetting(db, org, 'business_hours', businessHoursSchema, {
    ...SETTINGS_DEFAULTS.business_hours,
    week: { ...SETTINGS_DEFAULTS.business_hours.week },
    holidays: [],
  } as BusinessHoursSettings);
}

/** `tasks.defaultDueDays`. */
export async function getTasksSettings(db: DbOrTx, org: string): Promise<TasksSettings> {
  return readSetting(db, org, 'tasks', tasksSettingsSchema, SETTINGS_DEFAULTS.tasks);
}

/** `questions.expectedResponseText` (F8). */
export async function getQuestionsSettings(db: DbOrTx, org: string): Promise<QuestionsSettings> {
  return readSetting(db, org, 'questions', questionsSettingsSchema, SETTINGS_DEFAULTS.questions);
}

/** `checkin` (decision E5: the seed turns it on). */
export async function getCheckinSettings(db: DbOrTx, org: string): Promise<CheckinSettings> {
  return readSetting(db, org, 'checkin', checkinSettingsSchema, SETTINGS_DEFAULTS.checkin);
}

/**
 * `health.rules` and its version (stored with each health result; 0 = the built-in
 * default). An invalid row falls back to the default (logged).
 */
export async function getHealthRules(
  db: DbOrTx,
  org: string,
): Promise<{ rules: HealthRules; version: number }> {
  const row = await repo.findSettingRow(db, org, 'health.rules');
  if (!row) return { rules: SETTINGS_DEFAULTS['health.rules'], version: 0 };
  const parsed = healthRulesSchema.safeParse(row.value);
  if (!parsed.success) {
    logger.error(
      { event: 'settings.invalid', key: 'health.rules' },
      'invalid settings value; using default',
    );
    return { rules: SETTINGS_DEFAULTS['health.rules'], version: 0 };
  }
  return { rules: parsed.data, version: row.version };
}

// ---- settings API (api.md section 13) ------------------------------------------------

function settingEntry<K extends SettingsKey>(
  key: K,
  row: { value: unknown; version: number; updatedAt: Date } | undefined,
): SettingEntryDTO<K> {
  const fallback = SETTINGS_DEFAULTS[key] as SettingsValues[K];
  if (!row) return { key, value: fallback, version: 0, updatedAt: null };
  const parsed = SETTINGS_SCHEMAS[key].safeParse(row.value);
  return {
    key,
    value: parsed.success ? (parsed.data as SettingsValues[K]) : fallback,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadSettingsDTO(db: DbOrTx, org: string): Promise<SettingsDTO> {
  const rows = new Map((await repo.listSettingRows(db, org)).map((r) => [r.key, r]));
  const out: Record<string, SettingEntryDTO> = {};
  for (const key of SETTINGS_KEYS) out[key] = settingEntry(key, rows.get(key));
  return out as SettingsDTO;
}

/** GET /settings (A): every key with its value (default when never saved) and version. */
export async function getSettings(actor: Actor, db: DbOrTx = getDb()): Promise<SettingsDTO> {
  assertAdmin(actor);
  return loadSettingsDTO(db, actor.organizationId);
}

/** Keys whose change re-evaluates every student's health at once (ADR-0005). */
const SWEEP_KEYS: readonly SettingsKey[] = ['health.rules', 'checkin'];

async function writeSettings(
  actor: Actor,
  values: Partial<SettingsValues>,
  meta: AuditMeta,
  db: Db,
): Promise<SettingsDTO> {
  const keys = SETTINGS_KEYS.filter((k) => values[k] !== undefined);
  const result = await db.transaction(async (tx) => {
    const now = new Date();
    for (const key of keys) {
      const { version } = await repo.writeSetting(
        tx,
        actor.organizationId,
        key,
        values[key],
        actor.userId,
        now,
      );
      await recordAudit(tx, {
        actorId: actor.userId,
        action: 'settings.updated',
        targetType: 'settings',
        data: { key, version },
        ip: meta.ip ?? null,
      });
    }
    return loadSettingsDTO(tx, actor.organizationId);
  });
  if (keys.some((k) => SWEEP_KEYS.includes(k))) {
    await runHealthSweep(db, actor.organizationId, 'settings.updated');
  }
  return result;
}

/** PUT /settings (A): any subset of keys in one transaction (each validated by its schema). */
export async function updateSettings(
  actor: Actor,
  input: UpdateSettingsInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<SettingsDTO> {
  assertAdmin(actor);
  return writeSettings(actor, input as Partial<SettingsValues>, meta, db);
}

/** Persian field messages of a failed settings value (zod's own English ones are hidden). */
function settingsFields(issues: readonly { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join('.') || '_';
    const persian = /[؀-ۿ]/.test(issue.message);
    fields[path] ??= persian ? issue.message : 'مقدار نامعتبر است';
  }
  return fields;
}

/**
 * PUT /settings/:key (A): the body is the value of that key (its schema, `.strict()`).
 * Unknown key → 404. `health.rules` and `checkin` → immediate health sweep.
 */
export async function updateSetting(
  actor: Actor,
  key: string,
  body: unknown,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<SettingEntryDTO> {
  assertAdmin(actor);
  if (!(SETTINGS_KEYS as string[]).includes(key)) throw errors.notFound();
  const typedKey = key as SettingsKey;
  const parsed = SETTINGS_SCHEMAS[typedKey].safeParse(body);
  if (!parsed.success) throw errors.validation(settingsFields(parsed.error.issues));
  const all = await writeSettings(
    actor,
    { [typedKey]: parsed.data } as Partial<SettingsValues>,
    meta,
    db,
  );
  return all[typedKey];
}

/** GET /settings/public (*): response-time text and check-in on/off. */
export async function getPublicSettings(
  actor: Actor,
  db: DbOrTx = getDb(),
): Promise<PublicSettingsDTO> {
  const [questions, checkin] = await Promise.all([
    getQuestionsSettings(db, actor.organizationId),
    getCheckinSettings(db, actor.organizationId),
  ]);
  return {
    questions: { expectedResponseText: questions.expectedResponseText },
    checkin: { enabled: checkin.enabled, weekday: checkin.weekday },
  };
}

/** GET /settings/staff (A, M): read-only view for staff screens (sprint-2 frontend gap 5). */
export async function getStaffSettings(
  actor: Actor,
  db: DbOrTx = getDb(),
): Promise<StaffSettingsDTO> {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
  const [base, access, sla] = await Promise.all([
    getPublicSettings(actor, db),
    getAccessSettings(db, actor.organizationId),
    getSlaSettings(db, actor.organizationId),
  ]);
  return {
    ...base,
    access: {
      mentorScope: access.mentorScope,
      mentorsCanInviteStudents: access.mentorsCanInviteStudents,
      mentorsCanCreateGroupRuns: access.mentorsCanCreateGroupRuns ?? false,
    },
    sla: {
      questionHours: sla.questionHours,
      urgentQuestionHours: sla.urgentQuestionHours,
      reviewHours: sla.reviewHours,
      reviewHoursNonGate: sla.reviewHoursNonGate,
      clock: sla.clock,
    },
  };
}

// ---- milestone types (api.md section 12) ---------------------------------------------

export function toMilestoneTypeDTO(row: repo.MilestoneTypeRow): MilestoneTypeDTO {
  return {
    id: row.id,
    name: row.name,
    countsForNorthStar: row.countsForNorthStar,
    uniquePerStudent: row.uniquePerStudent,
    requiresEvidence: row.requiresEvidence,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

/** GET /milestone-types (*): active types; admins may ask for inactive ones too. */
export async function listMilestoneTypes(
  actor: Actor,
  options: { includeInactive?: boolean } = {},
  db: DbOrTx = getDb(),
): Promise<MilestoneTypeDTO[]> {
  const rows = await repo.listMilestoneTypes(
    db,
    actor.organizationId,
    actor.role === 'admin' && options.includeInactive === true,
  );
  return rows.map(toMilestoneTypeDTO);
}

/** POST /milestone-types (A). */
export async function createMilestoneType(
  actor: Actor,
  input: CreateMilestoneTypeInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<MilestoneTypeDTO> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const row = await repo.insertMilestoneType(tx, actor.organizationId, {
      name: input.name,
      countsForNorthStar: input.countsForNorthStar ?? false,
      uniquePerStudent: input.uniquePerStudent ?? false,
      requiresEvidence: input.requiresEvidence ?? false,
      sortOrder:
        input.sortOrder ?? (await repo.maxMilestoneTypeSortOrder(tx, actor.organizationId)) + 10,
      isActive: input.isActive ?? true,
    });
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'catalog.milestone_type_created',
      targetType: 'milestone_type',
      targetId: row.id,
      ip: meta.ip ?? null,
    });
    return toMilestoneTypeDTO(row);
  });
}

/** PATCH /milestone-types/:id (A). Deactivate with `isActive: false` (never deleted). */
export async function updateMilestoneType(
  actor: Actor,
  typeId: string,
  input: UpdateMilestoneTypeInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<MilestoneTypeDTO> {
  assertAdmin(actor);
  if (!isUuid(typeId)) throw errors.notFound();
  return db.transaction(async (tx) => {
    if (!(await repo.findMilestoneType(tx, actor.organizationId, typeId))) {
      throw errors.notFound();
    }
    const row = await repo.updateMilestoneType(tx, actor.organizationId, typeId, input);
    if (!row) throw errors.notFound();
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'catalog.milestone_type_updated',
      targetType: 'milestone_type',
      targetId: typeId,
      data: { fields: Object.keys(input) },
      ip: meta.ip ?? null,
    });
    return toMilestoneTypeDTO(row);
  });
}

/** Internal (milestones module): a type by id (active or not), or null. */
export async function getMilestoneType(
  db: DbOrTx,
  org: string,
  typeId: string,
): Promise<MilestoneTypeDTO | null> {
  if (!isUuid(typeId)) return null;
  const row = await repo.findMilestoneType(db, org, typeId);
  return row ? toMilestoneTypeDTO(row) : null;
}

// ---- canned responses (api.md section 10) --------------------------------------------

function toCannedResponseDTO(row: repo.CannedResponseRow): CannedResponseDTO {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** GET /canned-responses (A, M): active ones; admins may ask for inactive ones. */
export async function listCannedResponses(
  actor: Actor,
  options: { includeInactive?: boolean } = {},
  db: DbOrTx = getDb(),
): Promise<CannedResponseDTO[]> {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
  const rows = await repo.listCannedResponses(
    db,
    actor.organizationId,
    actor.role === 'admin' && options.includeInactive === true,
  );
  return rows.map(toCannedResponseDTO);
}

/** POST /canned-responses (A). */
export async function createCannedResponse(
  actor: Actor,
  input: CreateCannedResponseInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<CannedResponseDTO> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const row = await repo.insertCannedResponse(tx, actor.organizationId, {
      title: input.title,
      body: input.body,
      category: input.category ?? 'general',
      isActive: input.isActive ?? true,
      createdBy: actor.userId,
    });
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'catalog.canned_response_created',
      targetType: 'canned_response',
      targetId: row.id,
      ip: meta.ip ?? null,
    });
    return toCannedResponseDTO(row);
  });
}

/** PATCH /canned-responses/:id (A). */
export async function updateCannedResponse(
  actor: Actor,
  responseId: string,
  input: UpdateCannedResponseInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<CannedResponseDTO> {
  assertAdmin(actor);
  if (!isUuid(responseId)) throw errors.notFound();
  return db.transaction(async (tx) => {
    if (!(await repo.findCannedResponse(tx, actor.organizationId, responseId))) {
      throw errors.notFound();
    }
    const row = await repo.updateCannedResponse(tx, actor.organizationId, responseId, input);
    if (!row) throw errors.notFound();
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'catalog.canned_response_updated',
      targetType: 'canned_response',
      targetId: responseId,
      data: { fields: Object.keys(input) },
      ip: meta.ip ?? null,
    });
    return toCannedResponseDTO(row);
  });
}

// ---- task templates (api.md section 6; data-model.md 2-2) ----------------------------

export function toTaskTemplateDTO(row: repo.TaskTemplateRow): TaskTemplateDTO {
  return {
    id: row.id,
    stageId: row.stageId,
    title: row.title,
    description: row.description,
    kind: row.kind,
    submissionType: row.submissionType,
    defaultDueDays: row.defaultDueDays,
    requiredForGate: row.requiredForGate,
    suggestOnStageEntry: row.suggestOnStageEntry,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** GET /task-templates (A, M). Inactive templates only for admins who ask. */
export async function listTaskTemplates(
  actor: Actor,
  query: ListTaskTemplatesQuery = {},
  db: DbOrTx = getDb(),
): Promise<TaskTemplateDTO[]> {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
  const rows = await repo.listTaskTemplates(db, actor.organizationId, {
    stageId: query.stageId,
    includeInactive: actor.role === 'admin' && query.includeInactive === true,
  });
  return rows.map(toTaskTemplateDTO);
}

async function assertStageRef(
  db: DbOrTx,
  org: string,
  stageId: string | null | undefined,
): Promise<void> {
  if (!stageId) return;
  if (!isUuid(stageId) || !(await repo.isActiveRef(db, org, 'stage', stageId))) {
    throw errors.validation({ stageId: 'مقدار نامعتبر است' });
  }
}

/** POST /task-templates (A). */
export async function createTaskTemplate(
  actor: Actor,
  input: CreateTaskTemplateInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<TaskTemplateDTO> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    await assertStageRef(tx, actor.organizationId, input.stageId);
    const row = await repo.insertTaskTemplate(tx, actor.organizationId, {
      stageId: input.stageId ?? null,
      title: input.title,
      description: input.description ?? null,
      kind: input.kind ?? 'path_assignment',
      submissionType: input.submissionType ?? 'text',
      defaultDueDays: input.defaultDueDays ?? null,
      requiredForGate: input.requiredForGate ?? false,
      suggestOnStageEntry: input.suggestOnStageEntry ?? false,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    });
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'catalog.task_template_created',
      targetType: 'task_template',
      targetId: row.id,
      ip: meta.ip ?? null,
    });
    return toTaskTemplateDTO(row);
  });
}

/** PATCH /task-templates/:id (A). Deactivate with `isActive: false` (rows are never deleted). */
export async function updateTaskTemplate(
  actor: Actor,
  templateId: string,
  input: UpdateTaskTemplateInput,
  meta: AuditMeta = {},
  db: Db = getDb(),
): Promise<TaskTemplateDTO> {
  assertAdmin(actor);
  if (!isUuid(templateId)) throw errors.notFound();
  return db.transaction(async (tx) => {
    if (!(await repo.findTaskTemplate(tx, actor.organizationId, templateId))) {
      throw errors.notFound();
    }
    await assertStageRef(tx, actor.organizationId, input.stageId);
    const row = await repo.updateTaskTemplate(tx, actor.organizationId, templateId, input);
    if (!row) throw errors.notFound();
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'catalog.task_template_updated',
      targetType: 'task_template',
      targetId: templateId,
      data: { fields: Object.keys(input) },
      ip: meta.ip ?? null,
    });
    return toTaskTemplateDTO(row);
  });
}

/** Internal (tasks module): an active template, or null. */
export async function getActiveTaskTemplate(
  db: DbOrTx,
  org: string,
  templateId: string,
): Promise<TaskTemplateDTO | null> {
  if (!isUuid(templateId)) return null;
  const row = await repo.findTaskTemplate(db, org, templateId);
  return row?.isActive ? toTaskTemplateDTO(row) : null;
}

/** Internal (path module): active templates suggested on entering a stage (F3 Should). */
export async function listSuggestedTemplates(
  db: DbOrTx,
  org: string,
  stageId: string,
): Promise<TaskTemplateDTO[]> {
  const rows = await repo.listTaskTemplates(db, org, {
    stageId,
    includeInactive: false,
    suggestOnly: true,
  });
  return rows.map(toTaskTemplateDTO);
}
