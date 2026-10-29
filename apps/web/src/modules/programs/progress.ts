import { addDays } from '@/lib/org-day';
import type { NodeType } from './schema';

/**
 * Program progress (ADR-0012 section 6; Coach Office sprint 5): the one formula every screen
 * uses. Pure: the caller loads the facts.
 *
 *   progress = done required activities / required activities of the run (phases excluded)
 *     assignment → its task is `accepted` (submitted is not enough)
 *     lesson, resource → marked done
 *     checklist → every item ticked (a checklist without items: marked done)
 *     milestone → an approved milestone of its type; without a type, marked done by staff
 *   no required activity → `percent: null` («unknown», neither 0% nor 100%)
 */

export type ProgressNode = {
  id: string;
  nodeType: NodeType;
  isRequired: boolean;
  checklistItems: readonly string[];
  milestoneTypeId: string | null;
};

export type ProgressFacts = {
  /** Activities whose task for this enrollment is accepted. */
  acceptedNodeIds: ReadonlySet<string>;
  /** `node_completions` rows of this enrollment. */
  completions: ReadonlyMap<
    string,
    { checklistState: readonly boolean[]; completedAt: Date | null }
  >;
  /** Milestone types the student has an approved milestone of. */
  approvedMilestoneTypeIds: ReadonlySet<string>;
};

export type Progress = {
  done: number;
  total: number;
  /** 0–100, rounded down so 100 means every required activity is done; null when total = 0. */
  percent: number | null;
};

/** Is one activity done for this enrollment? (Optional activities too, for the checkmarks.) */
export function isNodeDone(node: ProgressNode, facts: ProgressFacts): boolean {
  switch (node.nodeType) {
    case 'phase':
      return false;
    case 'assignment':
      return facts.acceptedNodeIds.has(node.id);
    case 'checklist': {
      const row = facts.completions.get(node.id);
      if (!row) return false;
      if (node.checklistItems.length === 0) return row.completedAt !== null;
      return node.checklistItems.every((_, i) => row.checklistState[i] === true);
    }
    case 'milestone':
      return node.milestoneTypeId
        ? facts.approvedMilestoneTypeIds.has(node.milestoneTypeId)
        : (facts.completions.get(node.id)?.completedAt ?? null) !== null;
    default:
      return (facts.completions.get(node.id)?.completedAt ?? null) !== null;
  }
}

export function computeProgress(nodes: readonly ProgressNode[], facts: ProgressFacts): Progress {
  let done = 0;
  let total = 0;
  for (const node of nodes) {
    if (node.nodeType === 'phase' || !node.isRequired) continue;
    total += 1;
    if (isNodeDone(node, facts)) done += 1;
  }
  return { done, total, percent: total === 0 ? null : Math.floor((done * 100) / total) };
}

/** Average of the known percentages (unknown ones are left out); null when none is known. */
export function averagePercent(items: readonly Progress[]): number | null {
  const known = items.filter((p) => p.percent !== null);
  if (known.length === 0) return null;
  return Math.floor(known.reduce((sum, p) => sum + (p.percent ?? 0), 0) / known.length);
}

export type DuePhase = { id: string; expectedDays: number | null; isOpenEnded: boolean };

/**
 * Due day of an assignment for a run (sprint 5: «relative to the start of the run»). The
 * phase starts after the typical duration of the phases before it (open-ended ones count 0);
 * the assignment is due `dueOffsetDays` after that (default `fallbackDays`). A day in the
 * past (a late enrollment, a run without a start) moves to `today`.
 */
export function assignmentDueDay(input: {
  runStartsOn: string | null;
  phases: readonly DuePhase[];
  phaseId: string;
  dueOffsetDays: number | null;
  fallbackDays: number;
  today: string;
}): string {
  const start = input.runStartsOn ?? input.today;
  let before = 0;
  for (const phase of input.phases) {
    if (phase.id === input.phaseId) break;
    if (!phase.isOpenEnded) before += phase.expectedDays ?? 0;
  }
  const due = addDays(start, before + (input.dueOffsetDays ?? input.fallbackDays));
  return due < input.today ? input.today : due;
}

// ---- one-on-one mentoring and packages (Coach Office sprint 5b) ---------------------------

export type GoalState = 'open' | 'achieved' | 'dropped';

/**
 * One-on-one progress (ADR-0012 section 6): achieved goals / goals not dropped. Without such a
 * goal the progress is unknown, as for a program without required activities.
 */
export function goalProgress(statuses: readonly GoalState[]): Progress {
  const total = statuses.filter((s) => s !== 'dropped').length;
  const done = statuses.filter((s) => s === 'achieved').length;
  return { done, total, percent: total === 0 ? null : Math.floor((done * 100) / total) };
}

export type PackageUsage = {
  /** Sessions in the package; null = no quota. */
  quota: number | null;
  used: number;
  remaining: number | null;
  validUntil: string | null;
  /** Days from today to the last valid day (0 = today is the last); negative once expired. */
  daysLeft: number | null;
  overQuota: boolean;
  expired: boolean;
};

export type UsageSession = {
  status: 'scheduled' | 'held' | 'cancelled' | 'no_show';
  countsTowardQuota: boolean;
};

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

/**
 * Package use (ADR-0012 section 4): held and missed sessions that count toward the quota.
 * Running out or expiring never blocks a session; it only warns.
 */
export function packageUsage(input: {
  quota: number | null;
  validUntil: string | null;
  sessions: readonly UsageSession[];
  today: string;
}): PackageUsage {
  const used = input.sessions.filter(
    (s) => (s.status === 'held' || s.status === 'no_show') && s.countsTowardQuota,
  ).length;
  const daysLeft =
    input.validUntil === null ? null : dayNumber(input.validUntil) - dayNumber(input.today);
  return {
    quota: input.quota,
    used,
    remaining: input.quota === null ? null : Math.max(input.quota - used, 0),
    validUntil: input.validUntil,
    daysLeft,
    overQuota: input.quota !== null && used > input.quota,
    expired: daysLeft !== null && daysLeft < 0,
  };
}
