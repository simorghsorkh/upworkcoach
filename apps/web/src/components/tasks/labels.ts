import type { IconName } from '@/components/icons/icon';
import type { TaskStatus as ChipStatus } from '@/components/ui/badge';
import type { SubmissionType, TaskKind } from '@/modules/catalog/contracts';
import type { TaskStatus } from '@/modules/tasks/contracts';
import type { NoteKind } from '@/modules/timeline/contracts';

/**
 * Persian labels for the task, note and reminder enums. `Record<Enum, …>` makes the compiler
 * complain when the backend adds a value.
 */

export const submissionTypeLabel: Record<SubmissionType, string> = {
  text: 'عمومی',
  link: 'لینک',
  file: 'تصویر',
  proposal_review: 'پروپوزال برای بررسی',
  profile_review: 'پروفایل برای بررسی',
  checkbox: 'فقط تیک',
};

export const submissionTypeIcon: Record<SubmissionType, IconName> = {
  text: 'pen',
  link: 'link',
  file: 'file',
  proposal_review: 'chat',
  profile_review: 'user',
  checkbox: 'check-circle',
};

/** What the student will be asked for (hint under the type radios). */
export const submissionTypeHint: Record<SubmissionType, string> = {
  text: 'هنرجو متن تحویل می‌دهد؛ لینک و تصویر هم می‌تواند بگذارد.',
  link: 'هنرجو دست‌کم یک لینک می‌فرستد.',
  file: 'هنرجو دست‌کم یک تصویر (تا ۵ مگابایت) پیوست می‌کند.',
  proposal_review:
    'هنرجو پلتفرم، متن آگهی و متن پروپوزال را جدا می‌فرستد و رضایت استفاده‌ی بی‌نام را انتخاب می‌کند.',
  profile_review: 'هنرجو متن کامل ویترینش را می‌فرستد؛ نسخه‌ای از ویترین هم ثبت می‌شود.',
  checkbox: 'هنرجو فقط «انجام دادم» را می‌زند و کار مستقیم پذیرفته می‌شود.',
};

export const taskKindLabel: Record<TaskKind, string> = {
  path_assignment: 'کار مسیر',
  custom: 'سفارشی',
  follow_up: 'پیگیری',
  session_prep: 'آمادگی جلسه',
};

/** Backend status → the design-system chip (`changes_requested` → `changes`). */
export const chipStatus: Record<TaskStatus, ChipStatus> = {
  open: 'open',
  in_progress: 'in_progress',
  submitted: 'submitted',
  changes_requested: 'changes',
  accepted: 'accepted',
  cancelled: 'cancelled',
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  open: 'باز',
  in_progress: 'در حال انجام',
  submitted: 'منتظر بازبینی',
  changes_requested: 'نیاز به اصلاح',
  accepted: 'پذیرفته',
  cancelled: 'لغوشده',
};

/** Student-facing wording for the same statuses (mockups/student-home.html). */
export const studentStatusLabel: Record<TaskStatus, string> = {
  open: 'باز',
  in_progress: 'در حال انجام',
  submitted: 'تحویل دادی',
  changes_requested: 'نیاز به اصلاح',
  accepted: 'پذیرفته',
  cancelled: 'لغوشده',
};

export const FINAL: readonly TaskStatus[] = ['accepted', 'cancelled'];
/** The student still has to act: these can be overdue. */
export const STUDENT_ACTIONABLE: readonly TaskStatus[] = [
  'open',
  'in_progress',
  'changes_requested',
];

export const noteKindLabel: Record<NoteKind, string> = {
  note: 'یادداشت',
  session: 'جلسه',
  call: 'تماس',
  external_message: 'پیام بیرونی',
  weekly_review: 'مرور هفتگی',
};

/** Kinds offered in the composer (weekly review is written from the weekly review flow). */
export const COMPOSER_KINDS: readonly NoteKind[] = ['note', 'session', 'call', 'external_message'];

/** user-flows §5: «جلسه» opens with a short, deletable template. */
export const SESSION_TEMPLATE = 'خلاصه:\nتصمیم‌ها:\nکارهای بعدی: ';

/** mentor-workflow §6: the feedback template (verdict, strength, ≤ 3 fixes, next step). */
export const FEEDBACK_TEMPLATE = 'حکم: \nنقطه‌ی قوت:\n- \nمهم‌ترین اصلاح‌ها:\n1. \nقدم بعدی: ';
