import { z } from 'zod';
import { uuidInput } from '@/server/http/schemas';
import type { StaffQuestionListItemDTO } from '../questions/contracts';
import type { ReminderDTO } from '../reminders/contracts';
import type { StudentListItemDTO } from '../students/contracts';
import type { ReviewQueueItemDTO } from '../tasks/contracts';

/**
 * today — the first page of mentors and admins (PRD F6, api.md section 8). A read-model:
 * read-only SQL over several modules, always inside the actor's scope (ADR-0004).
 */

/** GET /today. `mentorId` (admin only; default everybody): owner of reminders / reviewer. */
export const todayQuery = z.strictObject({
  mentorId: uuidInput.optional(),
});
export type TodayQuery = z.infer<typeof todayQuery>;

/** "Waiting on us" (data-model.md 4-3): team-side waiting items with their SLA. */
export type WaitingOnUsItemDTO = {
  kind: 'review' | 'question' | 'red_no_action';
  studentId: string;
  /** Task id for `review`, thread id for `question`, student id for `red_no_action`. */
  refId: string;
  since: string;
  slaHours: number;
  elapsedHours: number;
  remainingHours: number;
  breached: boolean;
  warning: boolean;
  /**
   * `red_no_action` only: past `sla.redEscalateDays` — shown to every admin (also when an
   * admin filters by one mentor). Absent on other kinds.
   */
  escalated?: boolean;
};

/** A thread awaiting the team (sprint 4), most urgent first; see questions/contracts. */
export type UnansweredQuestionDTO = StaffQuestionListItemDTO;

/**
 * F-14 (ADR-0005 "Consequences"): is the hourly health sweep still running? Admin only. The UI
 * shows a small warning when `stale` (an active/paused student's result older than 3 h).
 */
export type HealthFreshnessDTO = {
  lastHealthSweepAt: string | null;
  oldestComputedAt: string | null;
  stale: boolean;
  staleAfterHours: number;
};

export type TodayDTO = {
  generatedAt: string;
  /** Admins only (absent for mentors): freshness of the health statuses (F-14). */
  healthFreshness?: HealthFreshnessDTO;
  /** Open reminders due before the end of today (Tehran), past ones first. */
  reminders: ReminderDTO[];
  /** Submitted tasks waiting for review, oldest first, with the review SLA. */
  reviewQueue: ReviewQueueItemDTO[];
  /** Threads awaiting the team (scope or assigned to me), breached first. */
  unansweredQuestions: UnansweredQuestionDTO[];
  /** Red then yellow `active` students, oldest status first; snoozed ones hidden (F7). */
  stuckStudents: StudentListItemDTO[];
  /** Reviews, questions and red-without-action, sorted by urgency (data-model.md 4-3). */
  waitingOnUs: WaitingOnUsItemDTO[];
  /** Numbers for the navigation badges and section headers. */
  counts: {
    reminders: number;
    overdueReminders: number;
    reviews: number;
    breachedReviews: number;
    unansweredQuestions: number;
    stuckStudents: number;
  };
};
