import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import {
  type ContentLink,
  cannedResponses,
  learningPaths,
  milestoneTypes,
  platforms,
  settings,
  stages,
  taskTemplates,
  tracks,
} from './schema';

/** catalog — queries. Only used inside the module. Columns are selected explicitly (SEC-A9). */

const trackColumns = {
  id: tracks.id,
  code: tracks.code,
  name: tracks.name,
  sortOrder: tracks.sortOrder,
  isActive: tracks.isActive,
};

const platformColumns = {
  id: platforms.id,
  name: platforms.name,
  trackId: platforms.trackId,
  sortOrder: platforms.sortOrder,
  isActive: platforms.isActive,
};

const stageColumns = {
  id: stages.id,
  pathId: stages.pathId,
  displayCode: stages.displayCode,
  name: stages.name,
  sortOrder: stages.sortOrder,
  expectedDays: stages.expectedDays,
  isOpenEnded: stages.isOpenEnded,
  studentDescription: stages.studentDescription,
  contentLinks: stages.contentLinks,
  isActive: stages.isActive,
};

export type TrackRow = Awaited<ReturnType<typeof listTracks>>[number];
export type PlatformRow = Awaited<ReturnType<typeof listPlatforms>>[number];
export type StageRow = Awaited<ReturnType<typeof listStages>>[number];

// ---- tracks --------------------------------------------------------------------------

export async function listTracks(db: DbOrTx, includeInactive: boolean) {
  return db
    .select(trackColumns)
    .from(tracks)
    .where(includeInactive ? undefined : eq(tracks.isActive, true))
    .orderBy(asc(tracks.sortOrder), asc(tracks.name));
}

export async function findTrack(db: DbOrTx, id: string) {
  const [row] = await db.select(trackColumns).from(tracks).where(eq(tracks.id, id));
  return row ?? null;
}

// ---- platforms -----------------------------------------------------------------------

export async function listPlatforms(db: DbOrTx, includeInactive: boolean) {
  return db
    .select(platformColumns)
    .from(platforms)
    .where(includeInactive ? undefined : eq(platforms.isActive, true))
    .orderBy(asc(platforms.sortOrder), asc(platforms.name));
}

export async function findPlatform(db: DbOrTx, id: string) {
  const [row] = await db.select(platformColumns).from(platforms).where(eq(platforms.id, id));
  return row ?? null;
}

export async function findPlatformByName(db: DbOrTx, name: string) {
  const [row] = await db
    .select(platformColumns)
    .from(platforms)
    .where(sql`lower(${platforms.name}) = lower(${name})`);
  return row ?? null;
}

export async function insertPlatform(
  db: DbOrTx,
  values: { name: string; trackId: string | null; sortOrder: number; isActive: boolean },
) {
  const now = new Date();
  const [row] = await db
    .insert(platforms)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning(platformColumns);
  if (!row) throw new Error('insertPlatform returned no row');
  return row;
}

export async function updatePlatform(
  db: DbOrTx,
  id: string,
  values: Partial<{ name: string; trackId: string | null; sortOrder: number; isActive: boolean }>,
) {
  const [row] = await db
    .update(platforms)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(platforms.id, id))
    .returning(platformColumns);
  return row ?? null;
}

export async function maxPlatformSortOrder(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${platforms.sortOrder})` })
    .from(platforms);
  return row?.max ?? 0;
}

// ---- paths and stages ----------------------------------------------------------------

export async function findDefaultPathId(db: DbOrTx): Promise<string | null> {
  const [row] = await db
    .select({ id: learningPaths.id })
    .from(learningPaths)
    .where(eq(learningPaths.isDefault, true));
  return row?.id ?? null;
}

export async function listStages(db: DbOrTx, pathId: string, includeInactive: boolean) {
  return db
    .select(stageColumns)
    .from(stages)
    .where(
      includeInactive
        ? eq(stages.pathId, pathId)
        : and(eq(stages.pathId, pathId), eq(stages.isActive, true)),
    )
    .orderBy(asc(stages.sortOrder), asc(stages.createdAt));
}

export async function findStage(db: DbOrTx, id: string) {
  const [row] = await db.select(stageColumns).from(stages).where(eq(stages.id, id));
  return row ?? null;
}

export async function findStages(db: DbOrTx, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db
    .select(stageColumns)
    .from(stages)
    .where(inArray(stages.id, [...ids]));
}

export async function maxStageSortOrder(db: DbOrTx, pathId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${stages.sortOrder})` })
    .from(stages)
    .where(eq(stages.pathId, pathId));
  return row?.max ?? 0;
}

export type StageValues = {
  displayCode: string;
  name: string;
  sortOrder: number;
  expectedDays: number | null;
  isOpenEnded: boolean;
  studentDescription: string | null;
  contentLinks: ContentLink[];
  isActive: boolean;
};

export async function insertStage(db: DbOrTx, pathId: string, values: StageValues) {
  const now = new Date();
  const [row] = await db
    .insert(stages)
    .values({ ...values, pathId, createdAt: now, updatedAt: now })
    .returning(stageColumns);
  if (!row) throw new Error('insertStage returned no row');
  return row;
}

export async function updateStage(db: DbOrTx, id: string, values: Partial<StageValues>) {
  const [row] = await db
    .update(stages)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(stages.id, id))
    .returning(stageColumns);
  return row ?? null;
}

/** Serialises concurrent writers of one path's stage list (reorder, create). */
export async function lockPath(db: DbOrTx, pathId: string): Promise<void> {
  await db.execute(
    sql`SELECT 1 FROM ${learningPaths} WHERE ${learningPaths.id} = ${pathId} FOR UPDATE`,
  );
}

// ---- reference checks (access.assertRefs) ---------------------------------------------

export type CatalogRefKind =
  | 'stage'
  | 'platform'
  | 'track'
  | 'template'
  | 'milestoneType'
  | 'cannedResponse';

export async function isActiveRef(db: DbOrTx, kind: CatalogRefKind, id: string): Promise<boolean> {
  const table =
    kind === 'stage'
      ? stages
      : kind === 'platform'
        ? platforms
        : kind === 'template'
          ? taskTemplates
          : kind === 'milestoneType'
            ? milestoneTypes
            : kind === 'cannedResponse'
              ? cannedResponses
              : tracks;
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.isActive, true)));
  return row !== undefined;
}

// ---- task templates ------------------------------------------------------------------

const templateColumns = {
  id: taskTemplates.id,
  stageId: taskTemplates.stageId,
  title: taskTemplates.title,
  description: taskTemplates.description,
  kind: taskTemplates.kind,
  submissionType: taskTemplates.submissionType,
  defaultDueDays: taskTemplates.defaultDueDays,
  requiredForGate: taskTemplates.requiredForGate,
  suggestOnStageEntry: taskTemplates.suggestOnStageEntry,
  sortOrder: taskTemplates.sortOrder,
  isActive: taskTemplates.isActive,
  updatedAt: taskTemplates.updatedAt,
};

export type TaskTemplateRow = Awaited<ReturnType<typeof listTaskTemplates>>[number];

export async function listTaskTemplates(
  db: DbOrTx,
  filter: { stageId?: string; includeInactive: boolean; suggestOnly?: boolean },
) {
  const conditions = [];
  if (!filter.includeInactive) conditions.push(eq(taskTemplates.isActive, true));
  if (filter.stageId) conditions.push(eq(taskTemplates.stageId, filter.stageId));
  if (filter.suggestOnly) conditions.push(eq(taskTemplates.suggestOnStageEntry, true));
  return db
    .select(templateColumns)
    .from(taskTemplates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(taskTemplates.sortOrder), asc(taskTemplates.createdAt));
}

export async function findTaskTemplate(db: DbOrTx, id: string) {
  const [row] = await db
    .select(templateColumns)
    .from(taskTemplates)
    .where(eq(taskTemplates.id, id));
  return row ?? null;
}

export type TaskTemplateValues = {
  stageId: string | null;
  title: string;
  description: string | null;
  kind: 'path_assignment' | 'custom' | 'follow_up' | 'session_prep';
  submissionType: 'text' | 'link' | 'file' | 'checkbox' | 'proposal_review' | 'profile_review';
  defaultDueDays: number | null;
  requiredForGate: boolean;
  suggestOnStageEntry: boolean;
  sortOrder: number;
  isActive: boolean;
};

export async function insertTaskTemplate(db: DbOrTx, values: TaskTemplateValues) {
  const now = new Date();
  const [row] = await db
    .insert(taskTemplates)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning(templateColumns);
  if (!row) throw new Error('insertTaskTemplate returned no row');
  return row;
}

export async function updateTaskTemplate(
  db: DbOrTx,
  id: string,
  values: Partial<TaskTemplateValues>,
) {
  const [row] = await db
    .update(taskTemplates)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(taskTemplates.id, id))
    .returning(templateColumns);
  return row ?? null;
}

// ---- settings ------------------------------------------------------------------------

export async function findSettingValue(db: DbOrTx, key: string): Promise<unknown | undefined> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key));
  return row?.value;
}

/** All settings rows (GET /settings). */
export async function listSettingRows(db: DbOrTx) {
  return db
    .select({
      key: settings.key,
      value: settings.value,
      version: settings.version,
      updatedAt: settings.updatedAt,
    })
    .from(settings);
}

export async function findSettingRow(db: DbOrTx, key: string) {
  const [row] = await db
    .select({ value: settings.value, version: settings.version, updatedAt: settings.updatedAt })
    .from(settings)
    .where(eq(settings.key, key));
  return row ?? null;
}

/** Row lock of one key (creates the row lazily inside the caller's transaction). */
export async function lockSettingRow(db: DbOrTx, key: string) {
  const [row] = await db
    .select({ version: settings.version })
    .from(settings)
    .where(eq(settings.key, key))
    .for('update');
  return row ?? null;
}

export async function writeSetting(
  db: DbOrTx,
  key: string,
  value: unknown,
  updatedBy: string | null,
  now: Date,
): Promise<{ version: number; updatedAt: Date }> {
  const existing = await lockSettingRow(db, key);
  if (existing) {
    const version = existing.version + 1;
    await db
      .update(settings)
      .set({ value, version, updatedBy, updatedAt: now })
      .where(eq(settings.key, key));
    return { version, updatedAt: now };
  }
  await db.insert(settings).values({ key, value, version: 1, updatedBy, updatedAt: now });
  return { version: 1, updatedAt: now };
}

// ---- milestone types -----------------------------------------------------------------

const milestoneTypeColumns = {
  id: milestoneTypes.id,
  name: milestoneTypes.name,
  countsForNorthStar: milestoneTypes.countsForNorthStar,
  uniquePerStudent: milestoneTypes.uniquePerStudent,
  requiresEvidence: milestoneTypes.requiresEvidence,
  sortOrder: milestoneTypes.sortOrder,
  isActive: milestoneTypes.isActive,
};

export type MilestoneTypeRow = Awaited<ReturnType<typeof listMilestoneTypes>>[number];

export async function listMilestoneTypes(db: DbOrTx, includeInactive: boolean) {
  return db
    .select(milestoneTypeColumns)
    .from(milestoneTypes)
    .where(includeInactive ? undefined : eq(milestoneTypes.isActive, true))
    .orderBy(asc(milestoneTypes.sortOrder), asc(milestoneTypes.createdAt));
}

export async function findMilestoneType(db: DbOrTx, id: string) {
  const [row] = await db
    .select(milestoneTypeColumns)
    .from(milestoneTypes)
    .where(eq(milestoneTypes.id, id));
  return row ?? null;
}

export type MilestoneTypeValues = {
  name: string;
  countsForNorthStar: boolean;
  uniquePerStudent: boolean;
  requiresEvidence: boolean;
  sortOrder: number;
  isActive: boolean;
};

export async function insertMilestoneType(db: DbOrTx, values: MilestoneTypeValues) {
  const now = new Date();
  const [row] = await db
    .insert(milestoneTypes)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning(milestoneTypeColumns);
  if (!row) throw new Error('insertMilestoneType returned no row');
  return row;
}

export async function updateMilestoneType(
  db: DbOrTx,
  id: string,
  values: Partial<MilestoneTypeValues>,
) {
  const [row] = await db
    .update(milestoneTypes)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(milestoneTypes.id, id))
    .returning(milestoneTypeColumns);
  return row ?? null;
}

export async function maxMilestoneTypeSortOrder(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${milestoneTypes.sortOrder}), 0)::int` })
    .from(milestoneTypes);
  return row?.max ?? 0;
}

// ---- canned responses ----------------------------------------------------------------

const cannedColumns = {
  id: cannedResponses.id,
  title: cannedResponses.title,
  body: cannedResponses.body,
  category: cannedResponses.category,
  isActive: cannedResponses.isActive,
  updatedAt: cannedResponses.updatedAt,
};

export type CannedResponseRow = Awaited<ReturnType<typeof listCannedResponses>>[number];

export async function listCannedResponses(db: DbOrTx, includeInactive: boolean) {
  return db
    .select(cannedColumns)
    .from(cannedResponses)
    .where(includeInactive ? undefined : eq(cannedResponses.isActive, true))
    .orderBy(asc(cannedResponses.category), asc(cannedResponses.title));
}

export async function findCannedResponse(db: DbOrTx, id: string) {
  const [row] = await db
    .select(cannedColumns)
    .from(cannedResponses)
    .where(eq(cannedResponses.id, id));
  return row ?? null;
}

export type CannedResponseValues = {
  title: string;
  body: string;
  category: 'red_line' | 'general';
  isActive: boolean;
};

export async function insertCannedResponse(
  db: DbOrTx,
  values: CannedResponseValues & { createdBy: string },
) {
  const now = new Date();
  const [row] = await db
    .insert(cannedResponses)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning(cannedColumns);
  if (!row) throw new Error('insertCannedResponse returned no row');
  return row;
}

export async function updateCannedResponse(
  db: DbOrTx,
  id: string,
  values: Partial<CannedResponseValues>,
) {
  const [row] = await db
    .update(cannedResponses)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(cannedResponses.id, id))
    .returning(cannedColumns);
  return row ?? null;
}
