import type { QuestionStatus } from '@/modules/questions/contracts';

/** F8 thread states as the staff read them. */
export const questionStatusLabel: Record<QuestionStatus, string> = {
  open: 'باز',
  answered: 'پاسخ‌داده',
  closed: 'بسته',
};

/** Subject of the student's «وقت بیشتری لازم دارم» question (sprint-4 frontend guide). */
export const EXTENSION_SUBJECT = 'درخواست تمدید مهلت';

/** One-line reminder of the red lines under the student's question form (user-flows §8). */
export const RED_LINES_HINT = 'درباره‌ی خرید یا اجاره‌ی اکانت و دور زدن احراز هویت کمکی نمی‌کنیم.';
