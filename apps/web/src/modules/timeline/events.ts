import type { DbOrTx } from '@/server/db';
import { timelineEvents } from './schema';

/**
 * timeline — automatic events (data-model.md 2-6). Services call `recordTimelineEvent`
 * inside their write transaction, right after the change it describes, so the event and
 * the change commit (or roll back) together.
 *
 * Schema-only imports: students, path, identity, tasks and reminders can use it without an
 * import cycle. `data` holds raw facts (ids, statuses, counts) and must never contain
 * secrets or links (same rule as audit_log); free text stays in its own table.
 */
export const TIMELINE_EVENT_TYPES = [
  'student.created',
  'student.updated',
  'student.lifecycle_changed',
  'mentor.changed',
  'invite.accepted',
  'stage.changed',
  'profile.added',
  'profile.updated',
  'profile.removed',
  'profile.approved',
  'task.created',
  'task.updated',
  'task.status_changed',
  'task.due_extended',
  'submission.created',
  'review.created',
  'question.created',
  'question.answered',
  'question.closed',
  'checkin.submitted',
  'milestone.proposed',
  'milestone.approved',
  'milestone.rejected',
  'flag.added',
  'flag.cleared',
  'health.changed',
  'health.snoozed',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type TimelineSubjectType =
  | 'profile'
  | 'stage_transition'
  | 'task'
  | 'submission'
  | 'review'
  | 'question'
  | 'milestone'
  | 'flag';

export type TimelineEventInput = {
  studentId: string;
  type: TimelineEventType;
  /** null = the system. */
  actorId: string | null;
  subjectType?: TimelineSubjectType;
  subjectId?: string;
  data: Record<string, unknown>;
  occurredAt?: Date;
};

const FORBIDDEN_KEY = /token|password|secret|url|link|cookie|hash/i;

/** Same rule as audit_log: no secrets or links in event data. */
export function assertSafeEventData(data: Record<string, unknown>): void {
  for (const key of Object.keys(data)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`timeline data must not contain "${key}"`);
  }
}

export async function recordTimelineEvent(db: DbOrTx, event: TimelineEventInput): Promise<void> {
  assertSafeEventData(event.data);
  await db.insert(timelineEvents).values({
    studentId: event.studentId,
    type: event.type,
    actorId: event.actorId,
    subjectType: event.subjectType ?? null,
    subjectId: event.subjectId ?? null,
    data: event.data,
    occurredAt: event.occurredAt ?? new Date(),
  });
}
