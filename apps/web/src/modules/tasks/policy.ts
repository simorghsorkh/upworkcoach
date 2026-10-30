import { tehranDay } from '@/lib/tehran-day';
import type { SubmissionType } from '../catalog/contracts';
import type { TASK_STATUSES } from './schema';

/**
 * tasks — pure rules (PRD F4, data-model.md 3-1, progress-tracking.md 4-2). No I/O; the
 * state machine and the "overdue" label are unit-tested here.
 *
 *   open ──start (S)──▶ in_progress
 *   open | in_progress ──submit (S)──▶ submitted        (checkbox: ──▶ accepted)
 *   changes_requested ──submit (S)──▶ submitted
 *   submitted ──review accepted (A/M)──▶ accepted
 *   submitted ──review changes (A/M)──▶ changes_requested  (revision_count + 1)
 *   any non-final ──cancel (A/M, reason)──▶ cancelled
 *   accepted, cancelled: final. Extending the deadline is allowed in any non-final state.
 */
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskAction = 'start' | 'submit' | 'review_accept' | 'review_changes' | 'cancel';

export const FINAL_STATUSES: readonly TaskStatus[] = ['accepted', 'cancelled'];
/** The ball is in the student's court: these can be overdue (data-model.md 2-5). */
export const STUDENT_ACTIONABLE: readonly TaskStatus[] = [
  'open',
  'in_progress',
  'changes_requested',
];

export const isFinal = (status: TaskStatus) => FINAL_STATUSES.includes(status);

/** The next status, or `null` when the action is not allowed from `current`. */
export function nextStatus(
  current: TaskStatus,
  action: TaskAction,
  submissionType: SubmissionType,
): TaskStatus | null {
  switch (action) {
    case 'start':
      return current === 'open' ? 'in_progress' : null;
    case 'submit':
      if (!STUDENT_ACTIONABLE.includes(current)) return null;
      // A tick-only task is done when the student ticks it (progress-tracking.md 4-2).
      return submissionType === 'checkbox' ? 'accepted' : 'submitted';
    case 'review_accept':
      return current === 'submitted' ? 'accepted' : null;
    case 'review_changes':
      return current === 'submitted' ? 'changes_requested' : null;
    case 'cancel':
      return isFinal(current) ? null : 'cancelled';
  }
}

/** Persian message for a refused transition (409 INVALID_TRANSITION). */
export function transitionError(current: TaskStatus, action: TaskAction): string {
  if (current === 'accepted') return 'این کار قبلاً تأیید شده است.';
  if (current === 'cancelled') return 'این کار لغو شده است.';
  switch (action) {
    case 'start':
      return 'این کار قبلاً شروع یا تحویل شده است.';
    case 'submit':
      return 'این کار تحویل شده و منتظر بازبینی است.';
    case 'review_accept':
    case 'review_changes':
      return 'این کار منتظر بازبینی نیست.';
    case 'cancel':
      return 'این کار دیگر قابل لغو نیست.';
  }
}

/** "Overdue": not done by the student and past the deadline. Never stored. */
export function isOverdue(status: TaskStatus, dueAt: Date, now: Date): boolean {
  return STUDENT_ACTIONABLE.includes(status) && dueAt.getTime() < now.getTime();
}

const DAY_MS = 24 * 3600 * 1000;

/** Tehran calendar days past the deadline (0 when not overdue, at least 1 when overdue). */
export function overdueDays(status: TaskStatus, dueAt: Date, now: Date): number {
  if (!isOverdue(status, dueAt, now)) return 0;
  const from = Date.parse(`${tehranDay(dueAt)}T00:00:00Z`);
  const to = Date.parse(`${tehranDay(now)}T00:00:00Z`);
  return Math.max(1, Math.round((to - from) / DAY_MS));
}

/** Student list order (F4): overdue first, then by deadline; finished ones last. */
export function compareForStudent(
  a: { status: TaskStatus; dueAt: Date },
  b: { status: TaskStatus; dueAt: Date },
  now: Date,
): number {
  const rank = (t: { status: TaskStatus; dueAt: Date }) =>
    isOverdue(t.status, t.dueAt, now) ? 0 : isFinal(t.status) ? 2 : 1;
  const diff = rank(a) - rank(b);
  if (diff !== 0) return diff;
  return a.dueAt.getTime() - b.dueAt.getTime();
}

export type SubmissionContent = {
  bodyText?: string | null;
  links?: readonly unknown[];
  attachmentIds?: readonly string[];
  platformId?: string;
  jobPostText?: string | null;
  proposalText?: string | null;
  profileText?: string | null;
};

const NOT_FOR_TYPE = 'برای این نوع کار نیست.';

/**
 * Required and forbidden fields per submission type (api.md section 6). Returns `{}` when
 * the content is acceptable, otherwise Persian messages per field (422).
 */
export function validateSubmission(
  type: SubmissionType,
  input: SubmissionContent,
): Record<string, string> {
  const fields: Record<string, string> = {};
  const hasBody = !!input.bodyText;
  const linkCount = input.links?.length ?? 0;
  const fileCount = input.attachmentIds?.length ?? 0;

  if (type !== 'proposal_review') {
    if (input.platformId !== undefined) fields.platformId = NOT_FOR_TYPE;
    if (input.jobPostText) fields.jobPostText = NOT_FOR_TYPE;
    if (input.proposalText) fields.proposalText = NOT_FOR_TYPE;
  }
  if (type !== 'profile_review' && input.profileText) fields.profileText = NOT_FOR_TYPE;

  switch (type) {
    case 'text':
      if (!hasBody) fields.bodyText = 'متن تحویل را بنویس.';
      break;
    case 'link':
      if (linkCount === 0) fields.links = 'دست‌کم یک لینک بگذار.';
      break;
    case 'file':
      if (fileCount === 0) fields.attachmentIds = 'دست‌کم یک تصویر پیوست کن.';
      break;
    case 'proposal_review':
      if (!input.platformId) fields.platformId = 'پلتفرم را انتخاب کن.';
      if (!input.jobPostText) fields.jobPostText = 'متن آگهی را وارد کن.';
      if (!input.proposalText) fields.proposalText = 'متن پروپوزال را وارد کن.';
      break;
    case 'profile_review':
      if (!input.profileText) fields.profileText = 'متن کامل ویترین را وارد کن.';
      break;
    case 'checkbox':
      break;
  }
  return fields;
}

/** Review texts are editable for 24 hours; the outcome never (data-model.md 2-5). */
export const REVIEW_EDIT_WINDOW_MS = 24 * 3600 * 1000;

export function canEditReview(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= REVIEW_EDIT_WINDOW_MS;
}
