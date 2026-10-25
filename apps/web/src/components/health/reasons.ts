import { faNumber } from '@/components/format/fa';
import type { Health } from '@/components/ui/badge';
import type {
  FlagCategory,
  FlagLevel,
  HealthBall,
  HealthReasonDTO,
  HealthRuleCode,
  HealthStatus,
} from '@/modules/health/contracts';

/**
 * Staff-only health wording (PRD F7, progress-tracking.md §7, sprint-4 frontend guide).
 * Pure functions: the plain Persian reason from `reasons[].facts`, «توپ در زمین …», and the
 * first suggested action of progress-tracking.md §7-3. Never imported by `(student)` pages.
 */

export const flagCategoryLabel: Record<FlagCategory, string> = {
  financial: 'مالی',
  platform_access: 'دسترسی به پلتفرم',
  personal: 'شخصی',
  language: 'زبان',
  other: 'سایر',
};

export const flagLevelLabel: Record<FlagLevel, string> = {
  yellow: 'نیاز به توجه',
  red: 'گیرکرده',
};

/** «توپ در زمین …» (who should act next). */
export const ballLabel: Record<HealthBall, string> = {
  student: 'هنرجو',
  team: 'ما',
  both: 'هر دو',
};

/** Short code-free description of each rule (settings page, legends). */
export const ruleTitle: Record<HealthRuleCode, string> = {
  'R-INACT': 'بی‌فعالیتی',
  'R-STALL': 'ماندن در مرحله',
  'R-OVERDUE': 'کار معوق',
  'R-LOOP': 'دور اصلاح یک کار',
  'R-NOTASK': 'نبود کار باز',
  'R-EXTEND': 'تمدید پیاپی مهلت',
  'R-FLAG': 'پرچم دستی',
  'R-CHECKIN': 'جا انداختن check-in',
  'R-MOOD': 'حال پایین در check-in',
};

/** First action of progress-tracking.md §7-3, shown under the reasons. */
export const ruleAdvice: Partial<Record<HealthRuleCode, string>> = {
  'R-INACT': 'پیام شخصی: «چه چیزی جلوی کارت را گرفته؟» + کوچک‌ترین قدم بعدی',
  'R-STALL': 'تماس ۱۵ دقیقه‌ای به‌جای بازخورد مکتوب؛ کار را کوچک‌تر کن',
  'R-LOOP': 'تماس ۱۵ دقیقه‌ای به‌جای بازخورد مکتوب',
  'R-OVERDUE': 'اندازه و وضوح کار را مرور کن؛ مهلت واقع‌بینانه با توافق هنرجو',
  'R-EXTEND': 'اندازه و وضوح کار را مرور کن؛ مهلت واقع‌بینانه با توافق هنرجو',
  'R-NOTASK': 'همین امروز کار بعدی را تعریف کن',
  'R-MOOD': 'پیام همدلانه‌ی شخصی؛ رد شدن را با عدد عادی کن',
  'R-CHECKIN': 'پیام شخصی و یادآوری check-in',
};

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** One active rule as a plain Persian phrase, e.g. «۲ کار معوق (بیشترین: ۹ روز)». */
export function reasonText(reason: Pick<HealthReasonDTO, 'rule' | 'facts'>): string {
  const f = reason.facts;
  switch (reason.rule) {
    case 'R-INACT':
      return `${faNumber(n(f.days))} روز بی‌فعالیت`;
    case 'R-STALL': {
      const expected = n(f.expectedDays);
      return expected
        ? `${faNumber(n(f.daysInStage))} روز در این مرحله (معمول: ${faNumber(expected)} روز)`
        : `${faNumber(n(f.daysInStage))} روز در این مرحله`;
    }
    case 'R-OVERDUE': {
      const count = n(f.overdueCount);
      const max = n(f.maxOverdueDays);
      if (count > 1) return `${faNumber(count)} کار معوق (بیشترین: ${faNumber(max)} روز)`;
      return `یک کار ${faNumber(max)} روز معوق`;
    }
    case 'R-LOOP':
      return `${faNumber(n(f.maxRevisions))} دور اصلاح یک کار`;
    case 'R-NOTASK':
      return `${faNumber(n(f.days))} روز بدون هیچ کار باز`;
    case 'R-EXTEND':
      return `${faNumber(n(f.maxExtensions))} بار تمدید مهلت یک کار`;
    case 'R-FLAG': {
      const cats = list(f.categories).map((c) => flagCategoryLabel[c as FlagCategory] ?? c);
      const count = n(f.count) || cats.length || 1;
      const head = count > 1 ? `${faNumber(count)} پرچم دستی` : 'پرچم دستی';
      return cats.length ? `${head}: ${cats.join('، ')}` : head;
    }
    case 'R-CHECKIN':
      return n(f.weeks) > 1
        ? `${faNumber(n(f.weeks))} هفته‌ی پیاپی check-in نداده`
        : 'check-in این هفته را نداده';
    case 'R-MOOD':
      return n(f.weeks) > 1
        ? `حال ${faNumber(n(f.mood))} از ۵ در ${faNumber(n(f.weeks))} هفته‌ی پیاپی`
        : `حال ${faNumber(n(f.mood))} از ۵ در check-in`;
    default:
      return 'نشانه‌ی گیر کردن';
  }
}

/** All reasons in one line: «۲ کار معوق · ۹ روز بی‌فعالیت». */
export function reasonsLine(reasons: ReadonlyArray<Pick<HealthReasonDTO, 'rule' | 'facts'>>) {
  return reasons.map(reasonText).join(' · ');
}

/** Badge kind for a status; `null` = nothing to show (untracked). */
export function healthKind(status: HealthStatus, churnRisk: boolean): Health | null {
  switch (status) {
    case 'red':
      return churnRisk ? 'churn' : 'red';
    case 'yellow':
    case 'green':
    case 'paused':
      return status;
    default:
      return null;
  }
}

/** Default «needs attention» order of the students list: red → yellow → waiting → green. */
export function attentionRank(
  status: HealthStatus | null | undefined,
  hasWaitingSubmission: boolean,
): number {
  if (status === 'red') return 0;
  if (status === 'yellow') return 1;
  if (hasWaitingSubmission) return 2;
  if (status === 'green') return 3;
  if (status === 'paused') return 4;
  return 5;
}
