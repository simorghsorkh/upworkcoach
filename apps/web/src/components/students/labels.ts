import type { StageTransitionDTO } from '@/modules/path/contracts';
import type {
  LifecycleStatus,
  PriorExperience,
  ProfileKind,
  ProfileStatus,
  RateUnit,
  StudentLevel,
} from '@/modules/students/contracts';

/**
 * Persian labels for the students/path enums. `Record<Enum, string>` makes the compiler
 * complain when the backend adds a value, so no option silently disappears from a form.
 */

export const lifecycleLabel: Record<LifecycleStatus, string> = {
  active: 'فعال',
  paused: 'متوقف',
  graduated: 'فارغ‌التحصیل',
  dropped: 'ریزش',
};

/** PRD §6: newcomer / applying / active / advanced. */
export const levelLabel: Record<StudentLevel, string> = {
  beginner: 'تازه‌کار',
  applying: 'در حال اپلای',
  active: 'فعال در بازار',
  advanced: 'پیشرفته',
};

export const priorExperienceLabel: Record<PriorExperience, string> = {
  none: 'هیچ تجربه‌ای ندارد',
  applied_no_result: 'اپلای کرده، بی‌نتیجه',
  few_contracts: 'چند قرارداد داشته',
  active: 'فریلنسر فعال',
};

export const profileKindLabel: Record<ProfileKind, string> = {
  profile: 'پروفایل',
  gig: 'گیگ',
  linkedin: 'پروفایل لینکدین',
  portfolio_page: 'صفحه‌ی نمونه‌کار',
  other: 'سایر',
};

export const profileStatusLabel: Record<ProfileStatus, string> = {
  building: 'در حال ساخت',
  active: 'فعال',
  restricted: 'محدودشده',
  suspended: 'معلق',
};

export const rateUnitLabel: Record<RateUnit, string> = {
  hour: 'ساعتی',
  fixed: 'ثابت',
  package: 'بسته',
  month: 'ماهانه',
};

/** "25 dollars/hour" style suffix. */
export const rateUnitSuffix: Record<RateUnit, string> = {
  hour: '/ساعت',
  fixed: ' (ثابت)',
  package: '/بسته',
  month: '/ماه',
};

export const transitionKindLabel: Record<StageTransitionDTO['kind'], string> = {
  initial: 'شروع',
  advance: 'عبور',
  skip_by_assessment: 'پرش با ارزیابی',
  advance_with_exception: 'عبور با استثنا',
  regress: 'برگشت',
};

/** `completeness.missing` field names (sprint-2 frontend guide). */
export const completenessFieldLabel: Record<string, string> = {
  mentor: 'مشاور',
  track: 'شاخه',
  primaryPlatform: 'پلتفرم اصلی',
  level: 'سطح',
  primarySkill: 'مهارت اصلی',
  nicheStatement: 'نیچ',
  messengerHandle: 'آیدی پیام‌رسان',
  englishWriting: 'انگلیسی',
  hoursPerWeek: 'وقت در هفته',
  incomeGoalUsd: 'هدف درآمد',
  goal90d: 'هدف ۹۰ روزه',
  primaryProfile: 'ویترین اصلی',
};

export const OPTIONS = {
  level: Object.entries(levelLabel) as Array<[StudentLevel, string]>,
  priorExperience: Object.entries(priorExperienceLabel) as Array<[PriorExperience, string]>,
  profileKind: Object.entries(profileKindLabel) as Array<[ProfileKind, string]>,
  profileStatus: Object.entries(profileStatusLabel) as Array<[ProfileStatus, string]>,
  rateUnit: Object.entries(rateUnitLabel) as Array<[RateUnit, string]>,
  lifecycle: Object.entries(lifecycleLabel) as Array<[LifecycleStatus, string]>,
};
