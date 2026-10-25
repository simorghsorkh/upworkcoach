import { toLocalMobile } from '@/lib/phone';
import { normalizeForSearch } from '@/lib/text-fa';
import type { Actor } from '@/server/auth/current-user';
import type { AccessSettings } from '../catalog/contracts';
import type { LifecycleStatus, OverExpected, StudentCountsDTO } from './contracts';

/**
 * students — access rules and pure helpers (ADR-0004 section 2, PRD F2/F3).
 * Outcomes: forbidden → 403 (the role may never call this), ok.
 * Scope (404) is decided by access.loadInScope, not here.
 */
export type Decision = 'ok' | 'forbidden';

export const isStaffRole = (actor: Actor) => actor.role === 'admin' || actor.role === 'mentor';

/** Staff routes (`/students/**`, `/profiles/:id/approve`, `/board`). */
export function staffOnly(actor: Actor): Decision {
  return isStaffRole(actor) ? 'ok' : 'forbidden';
}

/** Student routes (`/me/**`). */
export function studentOnly(actor: Actor): Decision {
  return actor.role === 'student' ? 'ok' : 'forbidden';
}

/** POST /students: admin; mentor only while `mentorsCanInviteStudents` (ADR-0004 table). */
export function createStudentDecision(actor: Actor, access: AccessSettings): Decision {
  if (actor.role === 'admin') return 'ok';
  if (actor.role === 'mentor') return access.mentorsCanInviteStudents ? 'ok' : 'forbidden';
  return 'forbidden';
}

/** PUT /students/:id/mentor: admin only. */
export function changeMentorDecision(actor: Actor): Decision {
  return actor.role === 'admin' ? 'ok' : 'forbidden';
}

/**
 * The primary mentor a new student gets: a mentor always gets the student (the body value
 * is ignored, ADR-0004 1-1); an admin chooses (default: unassigned).
 */
export function mentorForNewStudent(
  actor: Actor,
  requested: string | null | undefined,
): string | null {
  if (actor.role === 'mentor') return actor.userId;
  return requested ?? null;
}

const DAY_MS = 24 * 3600 * 1000;

/** Whole days since `since` (0 on the first day). */
export function daysSince(since: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
}

/** F3 kanban warning: over the stage's expected days → warn; over twice → over. */
export function overExpected(
  days: number,
  stage: { expectedDays: number | null; isOpenEnded: boolean },
): OverExpected {
  if (stage.isOpenEnded || stage.expectedDays === null) return 'none';
  if (days > 2 * stage.expectedDays) return 'over';
  if (days > stage.expectedDays) return 'warn';
  return 'none';
}

/**
 * `students.search_text` (ADR-0008): normalised name, phone in E.164 and local form,
 * messenger handle and tags. Searching normalises the query the same way.
 */
export function buildSearchText(input: {
  displayName: string;
  phone: string | null;
  messengerHandle: string | null;
  tags: readonly string[];
}): string {
  const phones = input.phone?.startsWith('+')
    ? [input.phone.slice(1), toLocalMobile(input.phone)]
    : [];
  return normalizeForSearch(
    [input.displayName, ...phones, input.messengerHandle ?? '', ...input.tags]
      .filter((part) => part !== '')
      .join(' '),
  );
}

/** Escapes LIKE wildcards in a search term. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** Fields counted by the "record N% complete" indicator (user-flows.md flow 2). */
const COMPLETENESS_FIELDS = [
  'mentor',
  'track',
  'primaryPlatform',
  'level',
  'primarySkill',
  'nicheStatement',
  'messengerHandle',
  'englishWriting',
  'hoursPerWeek',
  'incomeGoalUsd',
  'goal90d',
  'primaryProfile',
] as const;

export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number];

export function completeness(present: Record<CompletenessField, boolean>): {
  percent: number;
  missing: CompletenessField[];
} {
  const missing = COMPLETENESS_FIELDS.filter((f) => !present[f]);
  const percent = Math.round(
    ((COMPLETENESS_FIELDS.length - missing.length) / COMPLETENESS_FIELDS.length) * 100,
  );
  return { percent, missing };
}

/** Pure: chip counters from the (lifecycle, health) rows (see StudentCountsDTO). */
export function buildCounts(
  rows: ReadonlyArray<{
    lifecycleStatus: LifecycleStatus;
    healthStatus: string | null;
    count: number;
  }>,
  lifecycle: readonly LifecycleStatus[],
  health: readonly string[] | undefined,
): StudentCountsDTO {
  const counts: StudentCountsDTO = {
    total: 0,
    byLifecycle: { active: 0, paused: 0, graduated: 0, dropped: 0 },
    byHealth: { green: 0, yellow: 0, red: 0, paused: 0, untracked: 0, none: 0 },
  };
  for (const row of rows) {
    const h = (row.healthStatus ?? 'none') as keyof StudentCountsDTO['byHealth'];
    const healthOk = !health || health.length === 0 || health.includes(h);
    const lifecycleOk = lifecycle.includes(row.lifecycleStatus);
    if (healthOk) counts.byLifecycle[row.lifecycleStatus] += row.count;
    if (lifecycleOk && h in counts.byHealth) counts.byHealth[h] += row.count;
    if (healthOk && lifecycleOk) counts.total += row.count;
  }
  return counts;
}
