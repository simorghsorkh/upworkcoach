import type { Actor } from '@/server/auth/current-user';
import type { EnrollmentStatus, RunStatus, TemplateStatus, TemplateVisibility } from './schema';

/**
 * programs — access and state rules (ADR-0012 sections 2, 3 and 5). Pure; unit-tested.
 *
 * Templates (answer to Q5): an admin builds organization templates; a mentor builds private
 * ones, uses them for their own mentees and may send one for organization use, which an
 * admin approves or rejects. Another mentor never sees a private template.
 */

export type TemplateFacts = {
  ownerId: string | null;
  visibility: TemplateVisibility;
  status: TemplateStatus;
  isLegacy: boolean;
};

export type TemplateAccess = 'none' | 'view' | 'edit';

export function templateAccess(actor: Actor, t: TemplateFacts): TemplateAccess {
  if (actor.role === 'admin') return t.isLegacy ? 'view' : 'edit';
  if (actor.role !== 'mentor') return 'none';
  const own = t.ownerId === actor.userId;
  if (own && t.visibility !== 'organization') return 'edit';
  if (own) return 'view';
  return t.visibility === 'organization' && t.status !== 'draft' ? 'view' : 'none';
}

/** Whether the actor may start a run from the template. */
export function canRunTemplate(actor: Actor, t: TemplateFacts): boolean {
  if (t.status !== 'published' || templateAccess(actor, t) === 'none') return false;
  return t.visibility === 'organization' || t.ownerId === actor.userId;
}

/** Allowed run status changes; the same status is not a change. */
const RUN_NEXT: Record<RunStatus, readonly RunStatus[]> = {
  draft: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['active', 'archived'],
  archived: [],
};

export function canChangeRunStatus(from: RunStatus, to: RunStatus): boolean {
  return RUN_NEXT[from].includes(to);
}

/** Whether new mentees may join and phases may change. */
export function isRunOpen(status: RunStatus): boolean {
  return status === 'draft' || status === 'active';
}

const ENROLLMENT_NEXT: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  active: ['paused', 'completed', 'dropped'],
  paused: ['active', 'completed', 'dropped'],
  completed: ['active'],
  dropped: ['active'],
};

export function canChangeEnrollmentStatus(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
  return ENROLLMENT_NEXT[from].includes(to);
}

/** Enrollments that count against an individual run's single seat. */
export function holdsSeat(status: EnrollmentStatus): boolean {
  return status === 'active' || status === 'paused';
}

/**
 * Run access of a staff actor. `manage` = change the run, enrol, move phases;
 * `view` = a mentor who only sees their own mentees in it (sprint 3 still scopes mentors by
 * `students.primary_mentor_id`; sprint 4 moves it to `enrollment_mentors` and `run_staff`).
 */
export function runAccess(
  actor: Actor,
  facts: { isStaff: boolean; hasMenteeInScope: boolean },
): 'none' | 'view' | 'manage' {
  if (actor.role === 'admin') return 'manage';
  if (actor.role !== 'mentor') return 'none';
  if (facts.isStaff) return 'manage';
  return facts.hasMenteeInScope ? 'view' : 'none';
}

/** "My program" state of a phase for the mentee (like `pathState` of the 0.1 path). */
export function phaseState(
  position: number,
  currentPosition: number | null,
  enrollmentStatus: EnrollmentStatus,
): 'passed' | 'current' | 'locked' {
  if (enrollmentStatus === 'completed') return 'passed';
  if (currentPosition === null) return 'locked';
  if (position === currentPosition) return 'current';
  return position < currentPosition ? 'passed' : 'locked';
}
