import { addDays, tehranDay, tehranDayStart, tehranWeekday } from '@/lib/tehran-day';
import type { CheckinSettings, HealthRules, Weekday } from '../catalog/contracts';
import type { HealthBall, HealthReasonDTO, HealthRuleCode, HealthStatus } from './contracts';
import { HEALTH_RULES } from './contracts';

/**
 * evaluateHealth — the pure health function (ADR-0005, data-model.md 4-2, PRD F7,
 * progress-tracking.md 7). No I/O: `input-repo` collects the inputs, `recompute` stores the
 * result. Every threshold comes from `settings['health.rules']`.
 *
 * Interpretations (ADR-0005 table): a «day» is elapsed time (24 h); «2 overdue tasks» means
 * any delay unless `redCountMinDays` says otherwise; R-NOTASK counts `submitted` as open; a
 * phase with `is_open_ended` skips R-STALL and R-NOTASK (never a stage name or number).
 *
 * Coach Office sprint 5c: a mentee can be in several courses, each with its own phases. R-STALL
 * looks at the current phase of every active enrollment and reports the worst one; R-NOTASK
 * is skipped only when every current phase is open-ended. The main path is one of these
 * courses (its phases mirror the 0.1 stages).
 */

const DAY_MS = 24 * 3600 * 1000;

export type HealthTaskInput = {
  status: 'open' | 'in_progress' | 'submitted' | 'changes_requested';
  dueAt: Date;
  revisionCount: number;
  extensionCount: number;
};

/** The current phase of one active enrollment. */
export type HealthPhaseInput = {
  enteredAt: Date;
  expectedDays: number | null;
  isOpenEnded: boolean;
};

export type StudentHealthInput = {
  lifecycleStatus: 'active' | 'paused' | 'graduated' | 'dropped';
  joinedAt: Date;
  /** Base of R-INACT; null → `joinedAt`. */
  lastActivityAt: Date | null;
  /** Current phases of the active enrollments of open runs (main path included). */
  phases: HealthPhaseInput[];
  /** Tasks not accepted / cancelled. */
  openTasks: HealthTaskInput[];
  /** `closed_at` of the most recently finished task. */
  lastTaskClosedAt: Date | null;
  /** Active manual flags. */
  flags: Array<{ level: 'yellow' | 'red'; category: string }>;
  /** Recent check-ins (any order): `weekStart` = Saturday `YYYY-MM-DD` (Tehran). */
  checkins: Array<{ weekStart: string; mood: number }>;
  /**
   * Start of the current active period (later of `joinedAt` and the last return from a
   * pause): weeks before it do not count for R-CHECKIN.
   */
  activeSince: Date;
};

export type HealthResult = {
  status: HealthStatus;
  reasons: HealthReasonDTO[];
  churnRisk: boolean;
};

const BALL: Record<HealthRuleCode, HealthBall | null> = {
  'R-INACT': 'student',
  'R-STALL': 'both',
  'R-OVERDUE': 'student',
  'R-LOOP': 'both',
  'R-NOTASK': 'team',
  'R-EXTEND': 'student',
  'R-FLAG': null,
  'R-CHECKIN': 'student',
  'R-MOOD': 'student',
};

/** "Churn risk" set (R-LOWVOL joins in 1.0). */
export const CHURN_RULES: readonly HealthRuleCode[] = ['R-INACT', 'R-CHECKIN', 'R-MOOD'];

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sat: 0,
  sun: 1,
  mon: 2,
  tue: 3,
  wed: 4,
  thu: 5,
  fri: 6,
};

/** Saturday (`YYYY-MM-DD`) of the Tehran week that contains the Tehran day `day`. */
export function weekStartOf(day: string): string {
  return addDays(day, -WEEKDAY_INDEX[tehranWeekday(day)]);
}

/** Saturday of the current Tehran week. */
export function currentWeekStart(now: Date): string {
  return weekStartOf(tehranDay(now));
}

/** First instant the check-in form of week `weekStart` is open (start of the weekday). */
export function checkinWindowOpens(weekStart: string, weekday: Weekday): Date {
  return tehranDayStart(addDays(weekStart, WEEKDAY_INDEX[weekday]));
}

const elapsedDays = (from: Date, now: Date) => (now.getTime() - from.getTime()) / DAY_MS;

function level(
  value: number,
  yellow: number,
  red: number | null,
  strict: boolean,
): 'yellow' | 'red' | null {
  const hit = (threshold: number) => (strict ? value > threshold : value >= threshold);
  if (red !== null && hit(red)) return 'red';
  if (hit(yellow)) return 'yellow';
  return null;
}

/** Consecutive closed weeks without a check-in, counted back from the last closed week. */
export function missedCheckinWeeks(
  input: Pick<StudentHealthInput, 'checkins' | 'activeSince'>,
  checkin: Pick<CheckinSettings, 'weekday'>,
  now: Date,
  maxWeeks = 12,
): number {
  const done = new Set(input.checkins.map((c) => c.weekStart));
  let missed = 0;
  let week = addDays(currentWeekStart(now), -7);
  while (missed < maxWeeks) {
    // Only weeks whose whole form window was inside the active period.
    if (checkinWindowOpens(week, checkin.weekday).getTime() < input.activeSince.getTime()) break;
    if (done.has(week)) break;
    missed += 1;
    week = addDays(week, -7);
  }
  return missed;
}

/**
 * R-MOOD streak: the latest check-in (of this or last week) with mood ≤ max, and how many
 * consecutive weeks (back from it) stayed ≤ max.
 */
export function lowMoodStreak(
  checkins: StudentHealthInput['checkins'],
  maxMood: number,
  now: Date,
): { mood: number; weeks: number } | null {
  const byWeek = new Map(checkins.map((c) => [c.weekStart, c.mood]));
  const current = currentWeekStart(now);
  const startWeek = byWeek.has(current) ? current : addDays(current, -7);
  const latest = byWeek.get(startWeek);
  if (latest === undefined || latest > maxMood) return null;
  let weeks = 0;
  let week = startWeek;
  for (;;) {
    const mood = byWeek.get(week);
    if (mood === undefined || mood > maxMood) break;
    weeks += 1;
    week = addDays(week, -7);
  }
  return { mood: latest, weeks };
}

const SEVERITY = { red: 0, yellow: 1 } as const;

export function sortReasons(reasons: HealthReasonDTO[]): HealthReasonDTO[] {
  return [...reasons].sort(
    (a, b) =>
      SEVERITY[a.level] - SEVERITY[b.level] ||
      HEALTH_RULES.indexOf(a.rule) - HEALTH_RULES.indexOf(b.rule),
  );
}

export function evaluateHealth(
  input: StudentHealthInput,
  rules: HealthRules,
  now: Date,
  checkin: CheckinSettings = { enabled: false, weekday: 'thu' },
): HealthResult {
  if (input.lifecycleStatus === 'paused')
    return { status: 'paused', reasons: [], churnRisk: false };
  if (input.lifecycleStatus !== 'active') {
    return { status: 'untracked', reasons: [], churnRisk: false };
  }

  const reasons: HealthReasonDTO[] = [];
  const add = (
    rule: HealthRuleCode,
    lvl: 'yellow' | 'red' | null,
    facts: HealthReasonDTO['facts'],
  ) => {
    if (lvl) reasons.push({ rule, level: lvl, ball: BALL[rule], facts });
  };

  // R-INACT
  const inactive = elapsedDays(input.lastActivityAt ?? input.joinedAt, now);
  add('R-INACT', level(inactive, rules.inactivity.yellowDays, rules.inactivity.redDays, false), {
    days: Math.floor(inactive),
  });

  // R-STALL: the phase furthest past its expected days.
  let stall: { ratio: number; days: number; expected: number } | null = null;
  for (const phase of input.phases) {
    const expected = phase.expectedDays;
    if (expected === null || expected <= 0 || phase.isOpenEnded) continue;
    const days = elapsedDays(phase.enteredAt, now);
    if (!stall || days / expected > stall.ratio) stall = { ratio: days / expected, days, expected };
  }
  if (stall) {
    add('R-STALL', level(stall.ratio, rules.stall.yellowFactor, rules.stall.redFactor, true), {
      daysInStage: Math.floor(stall.days),
      expectedDays: stall.expected,
    });
  }

  // R-OVERDUE (only tasks the student still has to act on)
  const overdueDays = input.openTasks
    .filter((t) => t.status !== 'submitted' && t.dueAt.getTime() < now.getTime())
    .map((t) => elapsedDays(t.dueAt, now));
  if (overdueDays.length > 0) {
    const max = Math.max(...overdueDays);
    const counted = overdueDays.filter((d) => d > rules.overdue.redCountMinDays).length;
    const lvl =
      max > rules.overdue.redDays || counted >= rules.overdue.redCount
        ? 'red'
        : max > rules.overdue.yellowDays
          ? 'yellow'
          : null;
    add('R-OVERDUE', lvl, { overdueCount: overdueDays.length, maxOverdueDays: Math.floor(max) });
  }

  // R-LOOP
  const maxRevisions = Math.max(0, ...input.openTasks.map((t) => t.revisionCount));
  add('R-LOOP', level(maxRevisions, rules.loop.yellowRevisions, rules.loop.redRevisions, false), {
    maxRevisions,
  });

  // R-NOTASK: skipped only when every current phase is open-ended.
  const counted = input.phases.filter((p) => !p.isOpenEnded);
  if (input.openTasks.length === 0 && (counted.length > 0 || input.phases.length === 0)) {
    const since = Math.max(
      input.joinedAt.getTime(),
      ...counted.map((p) => p.enteredAt.getTime()),
      input.lastTaskClosedAt?.getTime() ?? 0,
    );
    const idle = elapsedDays(new Date(since), now);
    add('R-NOTASK', level(idle, rules.noTask.yellowDays, rules.noTask.redDays, false), {
      days: Math.floor(idle),
    });
  }

  // R-EXTEND
  const maxExtensions = Math.max(0, ...input.openTasks.map((t) => t.extensionCount));
  add('R-EXTEND', level(maxExtensions, rules.extend.yellowExtensions, null, false), {
    maxExtensions,
  });

  // R-FLAG
  if (input.flags.length > 0) {
    add('R-FLAG', input.flags.some((f) => f.level === 'red') ? 'red' : 'yellow', {
      count: input.flags.length,
      categories: [...new Set(input.flags.map((f) => f.category))],
    });
  }

  // R-CHECKIN and R-MOOD only while the weekly check-in is on.
  if (checkin.enabled) {
    const missed = missedCheckinWeeks(input, checkin, now);
    add('R-CHECKIN', level(missed, rules.checkin.yellowWeeks, rules.checkin.redWeeks, false), {
      weeks: missed,
    });
    const streak = lowMoodStreak(input.checkins, rules.mood.maxMood, now);
    if (streak) {
      add('R-MOOD', streak.weeks >= rules.mood.redConsecutiveWeeks ? 'red' : 'yellow', {
        mood: streak.mood,
        weeks: streak.weeks,
      });
    }
  }

  const churnCount = reasons.filter((r) => CHURN_RULES.includes(r.rule)).length;
  const churnRisk = churnCount >= rules.churnRisk.minRules;
  const status: HealthStatus =
    churnRisk || reasons.some((r) => r.level === 'red')
      ? 'red'
      : reasons.length > 0
        ? 'yellow'
        : 'green';
  return { status, reasons: sortReasons(reasons), churnRisk };
}

/**
 * Ball of the student as a whole: the balls of the reasons at the worst level (or of all
 * reasons for churn risk). Mixed → `both`; nothing active (or only flags) → null.
 */
export function overallBall(
  reasons: readonly Pick<HealthReasonDTO, 'level' | 'ball'>[],
): HealthBall | null {
  if (reasons.length === 0) return null;
  const worst = reasons.some((r) => r.level === 'red') ? 'red' : 'yellow';
  const balls = new Set(
    reasons.filter((r) => r.level === worst && r.ball !== null).map((r) => r.ball),
  );
  if (balls.size === 0) return null;
  if (balls.has('both') || (balls.has('student') && balls.has('team'))) return 'both';
  return balls.has('team') ? 'team' : 'student';
}

/** Stable signature of the active (rule, level) pairs: a change records `health.changed`. */
export function reasonSignature(reasons: readonly { rule: string; level: string }[]): string {
  return reasons
    .map((r) => `${r.rule}:${r.level}`)
    .sort()
    .join(',');
}
