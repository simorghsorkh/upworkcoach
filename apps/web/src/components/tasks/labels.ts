import type { IconName } from '@/components/icons/icon';
import type { TaskStatus as ChipStatus } from '@/components/ui/badge';
import type { Locale } from '@/i18n/config';
import { messagesFor } from '@/i18n/messages';
import type { SubmissionType, TaskKind } from '@/modules/catalog/contracts';
import type { TaskStatus } from '@/modules/tasks/contracts';
import type { NoteKind } from '@/modules/timeline/contracts';

/**
 * Labels for the task, note and reminder enums, from the `task` namespace of the message
 * catalog (ADR-0013). The exported maps are the Persian view for screens not yet extracted;
 * extracted screens use `taskLabels(locale)` / `useTaskLabels()`. `Record<Enum, …>` makes the
 * compiler complain when the backend adds a value.
 */
const fa = taskLabels('fa');

export type TaskLabels = {
  submissionType: Record<SubmissionType, string>;
  submissionTypeHint: Record<SubmissionType, string>;
  kind: Record<TaskKind, string>;
  status: Record<TaskStatus, string>;
  studentStatus: Record<TaskStatus, string>;
  noteKind: Record<NoteKind, string>;
  sessionTemplate: string;
  feedbackTemplate: string;
};

export function taskLabels(locale: Locale): TaskLabels {
  return messagesFor(locale).task;
}

export const submissionTypeLabel: Record<SubmissionType, string> = fa.submissionType;

export const submissionTypeIcon: Record<SubmissionType, IconName> = {
  text: 'pen',
  link: 'link',
  file: 'file',
  proposal_review: 'chat',
  profile_review: 'user',
  checkbox: 'check-circle',
};

/** What the student will be asked for (hint under the type radios). */
export const submissionTypeHint: Record<SubmissionType, string> = fa.submissionTypeHint;

export const taskKindLabel: Record<TaskKind, string> = fa.kind;

/** Backend status → the design-system chip (`changes_requested` → `changes`). */
export const chipStatus: Record<TaskStatus, ChipStatus> = {
  open: 'open',
  in_progress: 'in_progress',
  submitted: 'submitted',
  changes_requested: 'changes',
  accepted: 'accepted',
  cancelled: 'cancelled',
};

export const taskStatusLabel: Record<TaskStatus, string> = fa.status;

/** Student-facing wording for the same statuses (mockups/student-home.html). */
export const studentStatusLabel: Record<TaskStatus, string> = fa.studentStatus;

export const FINAL: readonly TaskStatus[] = ['accepted', 'cancelled'];
/** The student still has to act: these can be overdue. */
export const STUDENT_ACTIONABLE: readonly TaskStatus[] = [
  'open',
  'in_progress',
  'changes_requested',
];

export const noteKindLabel: Record<NoteKind, string> = fa.noteKind;

/** Kinds offered in the composer (weekly review is written from the weekly review flow). */
export const COMPOSER_KINDS: readonly NoteKind[] = ['note', 'session', 'call', 'external_message'];

/** user-flows §5: "Session" opens with a short, deletable template. */
export const SESSION_TEMPLATE = fa.sessionTemplate;

/** mentor-workflow §6: the feedback template (verdict, strength, ≤ 3 fixes, next step). */
export const FEEDBACK_TEMPLATE = fa.feedbackTemplate;
