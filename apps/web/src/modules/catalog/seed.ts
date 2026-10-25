import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../../server/db';
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
 * Run by `pnpm db:migrate` (after the SQL migrations) and by `pnpm db:seed`.
 * The numbers are the team's defaults; the founder changes them in the settings (D3).
 */

/** Fixed ids (UUIDv7 layout with a constant timestamp). */
const id = (n: number) => `01920000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

export const SEED_IDS = {
  tracks: { B: id(0x101), C: id(0x102), D: id(0x103) },
  path: id(0x201),
  stages: Array.from({ length: 9 }, (_, i) => id(0x300 + i)),
  platforms: {
    upwork: id(0x401),
    fiverr: id(0x402),
    contra: id(0x403),
    linkedin: id(0x404),
    freelancer: id(0x405),
    behance: id(0x406),
    direct: id(0x407),
    other: id(0x408),
  },
  taskTemplates: Array.from({ length: 16 }, (_, i) => id(0x500 + i)),
  milestoneTypes: {
    profileReady: id(0x601),
    firstApply: id(0x602),
    firstReply: id(0x603),
    firstContract: id(0x604),
    first500: id(0x605),
  },
  cannedResponses: { redLine: id(0x701) },
} as const;

/**
 * Default milestone types (PRD F9). Only «اولین قرارداد یا سفارش پولی» counts for the
 * North Star (flag, not name). «اولین …» types are unique per student.
 */
const MILESTONE_TYPES = [
  {
    id: SEED_IDS.milestoneTypes.profileReady,
    name: 'پروفایل آماده',
    countsForNorthStar: false,
    uniquePerStudent: true,
    requiresEvidence: false,
  },
  {
    id: SEED_IDS.milestoneTypes.firstApply,
    name: 'اولین اپلای',
    countsForNorthStar: false,
    uniquePerStudent: true,
    requiresEvidence: false,
  },
  {
    id: SEED_IDS.milestoneTypes.firstReply,
    name: 'اولین پاسخ یا مصاحبه',
    countsForNorthStar: false,
    uniquePerStudent: true,
    requiresEvidence: true,
  },
  {
    id: SEED_IDS.milestoneTypes.firstContract,
    name: 'اولین قرارداد یا سفارش پولی',
    countsForNorthStar: true,
    uniquePerStudent: true,
    requiresEvidence: true,
  },
  {
    id: SEED_IDS.milestoneTypes.first500,
    name: 'اولین درآمد بالای ۵۰۰ دلار',
    countsForNorthStar: false,
    uniquePerStudent: true,
    requiresEvidence: true,
  },
].map((t, i) => ({ ...t, sortOrder: (i + 1) * 10 }));

/** The standard «red lines» answer (PRD section 9, F8). */
const CANNED_RESPONSES = [
  {
    id: SEED_IDS.cannedResponses.redLine,
    title: 'خطوط قرمز: خرید یا اجاره‌ی اکانت',
    category: 'red_line' as const,
    body: 'به سؤال‌هایی درباره‌ی خرید، اجاره یا قرض گرفتن اکانت، دور زدن احراز هویت یا جعل مدارک پاسخ نمی‌دهیم. این کارها خلاف قوانین پلتفرم‌هاست و می‌تواند به بسته شدن همیشگی حساب و از دست رفتن درآمدت برسد. مسیر ما ساختن حساب و ویترین به نام خودت است؛ اگر در احراز هویت گیر کرده‌ای، بگو کجای کار مانده تا قدم بعدی را با هم پیدا کنیم.',
  },
];

const TRACKS = [
  { id: SEED_IDS.tracks.B, code: 'B', name: 'مناقصه‌ای', sortOrder: 1 },
  { id: SEED_IDS.tracks.C, code: 'C', name: 'کاتالوگی', sortOrder: 2 },
  { id: SEED_IDS.tracks.D, code: 'D', name: 'مستقیم', sortOrder: 3 },
];

const PLATFORMS = [
  { id: SEED_IDS.platforms.upwork, name: 'Upwork', trackId: SEED_IDS.tracks.B },
  { id: SEED_IDS.platforms.fiverr, name: 'Fiverr', trackId: SEED_IDS.tracks.C },
  { id: SEED_IDS.platforms.contra, name: 'Contra', trackId: null },
  { id: SEED_IDS.platforms.linkedin, name: 'LinkedIn', trackId: SEED_IDS.tracks.D },
  { id: SEED_IDS.platforms.freelancer, name: 'Freelancer', trackId: SEED_IDS.tracks.B },
  { id: SEED_IDS.platforms.behance, name: 'Behance/Dribbble', trackId: SEED_IDS.tracks.D },
  { id: SEED_IDS.platforms.direct, name: 'مشتری مستقیم', trackId: SEED_IDS.tracks.D },
  { id: SEED_IDS.platforms.other, name: 'سایر', trackId: null },
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

/** Inserts missing default rows; returns how many rows were added per table. */
export async function seedCatalogDefaults(db: DbOrTx): Promise<SeedResult> {
  const now = new Date();
  const insertedTracks = await db
    .insert(tracks)
    .values(TRACKS.map((t) => ({ ...t, isActive: true, createdAt: now, updatedAt: now })))
    .onConflictDoNothing()
    .returning({ id: tracks.id });
  const insertedPlatforms = await db
    .insert(platforms)
    .values(PLATFORMS.map((p) => ({ ...p, isActive: true, createdAt: now, updatedAt: now })))
    .onConflictDoNothing()
    .returning({ id: platforms.id });
  const insertedPaths = await db
    .insert(learningPaths)
    .values({ id: SEED_IDS.path, name: 'مسیر پیش‌فرض', isDefault: true, createdAt: now })
    .onConflictDoNothing()
    .returning({ id: learningPaths.id });
  const insertedMilestoneTypes = await db
    .insert(milestoneTypes)
    .values(MILESTONE_TYPES.map((t) => ({ ...t, isActive: true, createdAt: now, updatedAt: now })))
    .onConflictDoNothing()
    .returning({ id: milestoneTypes.id });
  const insertedCanned = await db
    .insert(cannedResponses)
    .values(CANNED_RESPONSES.map((c) => ({ ...c, isActive: true, createdAt: now, updatedAt: now })))
    .onConflictDoNothing()
    .returning({ id: cannedResponses.id });
  const insertedSettings = await db
    .insert(settings)
    .values(SEED_SETTINGS.map((x) => ({ ...x, version: 1, updatedAt: now })))
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
    .where(eq(learningPaths.id, SEED_IDS.path));
  if (!seedPath) {
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
        id: SEED_IDS.stages[i] ?? id(0x300 + i),
        pathId: SEED_IDS.path,
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
        id: SEED_IDS.taskTemplates[i] ?? id(0x500 + i),
        stageId: SEED_IDS.stages[stageIndex] ?? null,
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
  return {
    tracks: insertedTracks.length,
    platforms: insertedPlatforms.length,
    paths: insertedPaths.length,
    stages: insertedStages.length,
    taskTemplates: insertedTemplates.length,
    ...extras,
  };
}
