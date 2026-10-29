import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../server/db';
import { DEFAULT_ORGANIZATION_ID } from '../identity/schema';
import {
  cannedResponses,
  learningPaths,
  milestoneTypes,
  platforms,
  settings,
  stages,
  taskTemplates,
  tracks,
} from './schema';

/**
 * Default catalog data (data-model.md 2-2): tracks B/C/D, the platform list, the default
 * learning path and its 9 stages from learning-path.md section 3.
 *
 * Idempotent: every row has a fixed id and is inserted with `ON CONFLICT DO NOTHING`, so a
 * second run adds nothing and NEVER overwrites what the admin edited, renamed, reordered or
 * deactivated in the settings. Rows are never deleted by the app, so a fixed id that is
 * missing really means "not seeded yet".
 *
 * Per organization (ADR-0011): the default organization keeps the 0.1 ids (SEED_IDS); any
 * other organization gets its own ids derived from its id, so its seed is idempotent too.
 *
 * Run by `pnpm db:migrate` (after the SQL migrations), by `pnpm db:seed` and by
 * `pnpm org:create`. The numbers are the team's defaults; each organization's admin changes
 * them in the settings (D3).
 */

/** Fixed ids (UUIDv7 layout with a constant timestamp). */
const id = (n: number) => `01920000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

/** Deterministic id of seed row `n` in another organization (UUID version 8 layout). */
function derivedId(org: string, n: number): string {
  const h = createHash('sha256').update(`${org}:catalog-seed:${n}`).digest('hex');
  const variant = ((Number.parseInt(h[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function seedIds(idOf: (n: number) => string) {
  return {
    tracks: { B: idOf(0x101), C: idOf(0x102), D: idOf(0x103) },
    path: idOf(0x201),
    stages: Array.from({ length: 9 }, (_, i) => idOf(0x300 + i)),
    platforms: {
      upwork: idOf(0x401),
      fiverr: idOf(0x402),
      contra: idOf(0x403),
      linkedin: idOf(0x404),
      freelancer: idOf(0x405),
      behance: idOf(0x406),
      direct: idOf(0x407),
      other: idOf(0x408),
    },
    taskTemplates: Array.from({ length: 16 }, (_, i) => idOf(0x500 + i)),
    milestoneTypes: {
      profileReady: idOf(0x601),
      firstApply: idOf(0x602),
      firstReply: idOf(0x603),
      firstContract: idOf(0x604),
      first500: idOf(0x605),
    },
    cannedResponses: { redLine: idOf(0x701) },
  };
}

export type SeedIds = ReturnType<typeof seedIds>;

/** Seed ids of the default organization (the 0.1 data). */
export const SEED_IDS: SeedIds = seedIds(id);

/** Seed ids of any organization. */
export function seedIdsFor(org: string): SeedIds {
  return org === DEFAULT_ORGANIZATION_ID ? SEED_IDS : seedIds((n) => derivedId(org, n));
}

/**
 * Default milestone types (PRD F9). Only «اولین قرارداد یا سفارش پولی» counts for the
 * North Star (flag, not name). «اولین …» types are unique per student.
 */
const milestoneTypeRows = (ids: SeedIds) =>
  [
    {
      id: ids.milestoneTypes.profileReady,
      name: 'پروفایل آماده',
      countsForNorthStar: false,
      uniquePerStudent: true,
      requiresEvidence: false,
    },
    {
      id: ids.milestoneTypes.firstApply,
      name: 'اولین اپلای',
      countsForNorthStar: false,
      uniquePerStudent: true,
      requiresEvidence: false,
    },
    {
      id: ids.milestoneTypes.firstReply,
      name: 'اولین پاسخ یا مصاحبه',
      countsForNorthStar: false,
      uniquePerStudent: true,
      requiresEvidence: true,
    },
    {
      id: ids.milestoneTypes.firstContract,
      name: 'اولین قرارداد یا سفارش پولی',
      countsForNorthStar: true,
      uniquePerStudent: true,
      requiresEvidence: true,
    },
    {
      id: ids.milestoneTypes.first500,
      name: 'اولین درآمد بالای ۵۰۰ دلار',
      countsForNorthStar: false,
      uniquePerStudent: true,
      requiresEvidence: true,
    },
  ].map((t, i) => ({ ...t, sortOrder: (i + 1) * 10 }));

/** The standard «red lines» answer (PRD section 9, F8). */
const cannedResponseRows = (ids: SeedIds) => [
  {
    id: ids.cannedResponses.redLine,
    title: 'خطوط قرمز: خرید یا اجاره‌ی اکانت',
    category: 'red_line' as const,
    body: 'به سؤال‌هایی درباره‌ی خرید، اجاره یا قرض گرفتن اکانت، دور زدن احراز هویت یا جعل مدارک پاسخ نمی‌دهیم. این کارها خلاف قوانین پلتفرم‌هاست و می‌تواند به بسته شدن همیشگی حساب و از دست رفتن درآمدت برسد. مسیر ما ساختن حساب و ویترین به نام خودت است؛ اگر در احراز هویت گیر کرده‌ای، بگو کجای کار مانده تا قدم بعدی را با هم پیدا کنیم.',
  },
];

const trackRows = (ids: SeedIds) => [
  { id: ids.tracks.B, code: 'B', name: 'مناقصه‌ای', sortOrder: 1 },
  { id: ids.tracks.C, code: 'C', name: 'کاتالوگی', sortOrder: 2 },
  { id: ids.tracks.D, code: 'D', name: 'مستقیم', sortOrder: 3 },
];

const platformRows = (ids: SeedIds) =>
  [
    { id: ids.platforms.upwork, name: 'Upwork', trackId: ids.tracks.B },
    { id: ids.platforms.fiverr, name: 'Fiverr', trackId: ids.tracks.C },
    { id: ids.platforms.contra, name: 'Contra', trackId: null },
    { id: ids.platforms.linkedin, name: 'LinkedIn', trackId: ids.tracks.D },
    { id: ids.platforms.freelancer, name: 'Freelancer', trackId: ids.tracks.B },
    { id: ids.platforms.behance, name: 'Behance/Dribbble', trackId: ids.tracks.D },
    { id: ids.platforms.direct, name: 'مشتری مستقیم', trackId: ids.tracks.D },
    { id: ids.platforms.other, name: 'سایر', trackId: null },
  ].map((p, i) => ({ ...p, sortOrder: (i + 1) * 10 }));

/**
 * learning-path.md section 3. `expectedDays` = upper end of the range (data-model.md 2-2):
 * 4, 10, 10, 14, 5, 42, empty, empty, empty; "growth" is open-ended.
 */
const STAGES: Array<{
  displayCode: string;
  name: string;
  expectedDays: number | null;
  isOpenEnded: boolean;
  studentDescription: string;
}> = [
  {
    displayCode: '۰',
    name: 'شروع و تعیین سطح',
    expectedDays: 4,
    isOpenEnded: false,
    studentDescription: 'فرم ورود، هدف ۹۰ روزه و انتخاب شاخه؛ جلسه‌ی آشنایی با مشاور.',
  },
  {
    displayCode: '۱',
    name: 'انتخاب نیچ',
    expectedDays: 10,
    isOpenEnded: false,
    studentDescription: 'سند نیچ: جمله‌ی نیچ، ۱۰ شاهد تقاضا و تحلیل ۳ رقیب.',
  },
  {
    displayCode: '۲',
    name: 'ساخت ویترین',
    expectedDays: 10,
    isOpenEnded: false,
    studentDescription: 'متن کامل پروفایل، گیگ یا LinkedIn و نرخ اولیه.',
  },
  {
    displayCode: '۳',
    name: 'نمونه‌کار',
    expectedDays: 14,
    isOpenEnded: false,
    studentDescription: '۲ تا ۳ نمونه‌کار مرتبط با نیچ (هم‌زمان با ساخت ویترین).',
  },
  {
    displayCode: '۴',
    name: 'پیدا کردن فرصت مناسب',
    expectedDays: 5,
    isOpenEnded: false,
    studentDescription: '۱۰ فرصت ارزیابی‌شده با تصمیم «برو / نرو».',
  },
  {
    displayCode: '۵',
    name: 'پروپوزال و ارسال فعال',
    expectedDays: 42,
    isOpenEnded: false,
    studentDescription: 'پروپوزال‌های کالیبره و ارسال منظم.',
  },
  {
    displayCode: '۶',
    name: 'مصاحبه و مذاکره',
    expectedDays: null,
    isOpenEnded: false,
    studentDescription: 'آمادگی مصاحبه و رسیدن به اولین قرارداد.',
  },
  {
    displayCode: '۷',
    name: 'تحویل پروژه و گرفتن نظر',
    expectedDays: null,
    isOpenEnded: false,
    studentDescription: 'برنامه‌ی پروژه، تحویل خوب و گرفتن نظر مثبت.',
  },
  {
    displayCode: '۸',
    name: 'رشد',
    expectedDays: null,
    isOpenEnded: true,
    studentDescription: 'مرور ماهانه‌ی رشد: نرخ بالاتر، کارفرمای تکراری، درآمد پایدار.',
  },
];

/**
 * Default task templates of each stage (progress-tracking.md 4-3), suggested on entering
 * the stage (F3 Should; never created automatically). [stage index, title, days, type, gate]
 */
const TEMPLATES: Array<
  [
    number,
    string,
    number,
    'text' | 'link' | 'checkbox' | 'proposal_review' | 'profile_review',
    boolean,
  ]
> = [
  [0, 'تکمیل فرم ورود', 2, 'checkbox', true],
  [0, 'نوشتن هدف ۹۰ روزه', 2, 'text', true],
  [0, 'رزرو جلسه‌ی آشنایی', 3, 'checkbox', true],
  [1, 'سند نیچ: جمله‌ی نیچ + ۱۰ شاهد تقاضا + ۳ رقیب', 7, 'text', true],
  [2, 'ارسال متن ویترین برای بررسی', 5, 'profile_review', true],
  [2, 'نرخ اولیه با دلیل', 5, 'text', true],
  [3, 'نمونه‌کار ۱', 7, 'link', true],
  [3, 'نمونه‌کار ۲', 14, 'link', true],
  [4, 'ارزیابی ۱۰ فرصت با تصمیم «برو / نرو»', 5, 'text', true],
  [5, '۳ پروپوزال کالیبره', 7, 'proposal_review', true],
  [5, 'سهمیه‌ی ارسال این هفته', 7, 'text', false],
  [6, 'برگه‌ی آمادگی مصاحبه', 3, 'text', true],
  [6, 'مصاحبه‌ی تمرینی', 7, 'checkbox', true],
  [7, 'برنامه‌ی پروژه', 2, 'text', true],
  [7, 'جمع‌بندی درس‌های پروژه', 3, 'text', false],
  [8, 'مرور ماهانه‌ی رشد', 30, 'text', false],
];

export type SeedResult = {
  tracks: number;
  platforms: number;
  paths: number;
  stages: number;
  taskTemplates: number;
  milestoneTypes: number;
  cannedResponses: number;
  settings: number;
};

/**
 * Settings rows written by the seed (missing rows only; an admin's value is never
 * overwritten). Decision E5: the weekly check-in is ON.
 */
const SEED_SETTINGS = [{ key: 'checkin', value: { enabled: true, weekday: 'thu' } }];

/**
 * Inserts the missing default rows of one organization (default: the 0.1 organization);
 * returns how many rows were added per table.
 */
export async function seedCatalogDefaults(
  db: DbOrTx,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SeedResult> {
  const now = new Date();
  const ids = seedIdsFor(organizationId);
  const own = { organizationId, isActive: true, createdAt: now, updatedAt: now };
  const insertedTracks = await db
    .insert(tracks)
    .values(trackRows(ids).map((t) => ({ ...t, ...own })))
    .onConflictDoNothing()
    .returning({ id: tracks.id });
  const insertedPlatforms = await db
    .insert(platforms)
    .values(platformRows(ids).map((p) => ({ ...p, ...own })))
    .onConflictDoNothing()
    .returning({ id: platforms.id });
  const insertedPaths = await db
    .insert(learningPaths)
    .values({ id: ids.path, organizationId, name: 'مسیر پیش‌فرض', isDefault: true, createdAt: now })
    .onConflictDoNothing()
    .returning({ id: learningPaths.id });
  const insertedMilestoneTypes = await db
    .insert(milestoneTypes)
    .values(milestoneTypeRows(ids).map((t) => ({ ...t, ...own })))
    .onConflictDoNothing()
    .returning({ id: milestoneTypes.id });
  const insertedCanned = await db
    .insert(cannedResponses)
    .values(cannedResponseRows(ids).map((c) => ({ ...c, ...own })))
    .onConflictDoNothing()
    .returning({ id: cannedResponses.id });
  const insertedSettings = await db
    .insert(settings)
    .values(SEED_SETTINGS.map((x) => ({ ...x, organizationId, version: 1, updatedAt: now })))
    .onConflictDoNothing()
    .returning({ key: settings.key });
  const extras = {
    milestoneTypes: insertedMilestoneTypes.length,
    cannedResponses: insertedCanned.length,
    settings: insertedSettings.length,
  };
  // Another default path (created by hand) wins; then the default stages are not seeded.
  const [seedPath] = await db
    .select({ id: learningPaths.id })
    .from(learningPaths)
    .where(eq(learningPaths.id, ids.path));
  if (!seedPath) {
    await db.execute(sql`SELECT ensure_legacy_program(${organizationId})`);
    return {
      tracks: insertedTracks.length,
      platforms: insertedPlatforms.length,
      paths: 0,
      stages: 0,
      taskTemplates: 0,
      ...extras,
    };
  }
  const insertedStages = await db
    .insert(stages)
    .values(
      STAGES.map((s, i) => ({
        ...s,
        id: ids.stages[i] as string,
        pathId: ids.path,
        sortOrder: (i + 1) * 10,
        contentLinks: [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: stages.id });
  const insertedTemplates = await db
    .insert(taskTemplates)
    .values(
      TEMPLATES.map(([stageIndex, title, days, submissionType, gate], i) => ({
        organizationId,
        id: ids.taskTemplates[i] as string,
        stageId: ids.stages[stageIndex] ?? null,
        title,
        kind: 'path_assignment' as const,
        submissionType,
        defaultDueDays: days,
        requiredForGate: gate,
        suggestOnStageEntry: true,
        sortOrder: (i + 1) * 10,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: taskTemplates.id });
  // ADR-0012 section 9: the default path's legacy program template, run and enrollments
  // (SQL function of migration 0008; idempotent, adds only what is missing).
  await db.execute(sql`SELECT ensure_legacy_program(${organizationId})`);
  return {
    tracks: insertedTracks.length,
    platforms: insertedPlatforms.length,
    paths: insertedPaths.length,
    stages: insertedStages.length,
    taskTemplates: insertedTemplates.length,
    ...extras,
  };
}
