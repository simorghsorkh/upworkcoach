import { describe, expect, it } from 'vitest';
import { DEFAULT_HEALTH_RULES, type HealthRules } from '../catalog/contracts';
import {
  currentWeekStart,
  evaluateHealth,
  type HealthTaskInput,
  lowMoodStreak,
  missedCheckinWeeks,
  overallBall,
  reasonSignature,
  type StudentHealthInput,
  weekStartOf,
} from './rules';

/** Tuesday 2026-10-20, 11:30 Tehran. Current week starts Saturday 2026-10-17. */
const NOW = new Date('2026-10-20T08:00:00Z');
const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY);

const futureTask: HealthTaskInput = {
  status: 'open',
  dueAt: inDays(3),
  revisionCount: 0,
  extensionCount: 0,
};

type BaseInput = Partial<StudentHealthInput> & {
  /** Shorthand for a single current phase (the main path). */
  stageEnteredAt?: Date;
  stage?: { expectedDays: number | null; isOpenEnded: boolean };
};

function base({ stageEnteredAt, stage, ...over }: BaseInput = {}): StudentHealthInput {
  return {
    lifecycleStatus: 'active',
    joinedAt: ago(2),
    lastActivityAt: ago(0.1),
    phases: [
      {
        enteredAt: stageEnteredAt ?? ago(2),
        expectedDays: stage ? stage.expectedDays : 10,
        isOpenEnded: stage?.isOpenEnded ?? false,
      },
    ],
    openTasks: [futureTask],
    lastTaskClosedAt: null,
    flags: [],
    checkins: [],
    activeSince: ago(2),
    ...over,
  };
}

const CHECKIN_ON = { enabled: true, weekday: 'thu' as const };

function run(
  input: StudentHealthInput,
  rules: HealthRules = DEFAULT_HEALTH_RULES,
  checkin = { enabled: false, weekday: 'thu' as const },
) {
  return evaluateHealth(input, rules, NOW, checkin);
}

/** The level of one rule, or null when it is not active. */
function levelOf(
  input: StudentHealthInput,
  rule: string,
  rules?: HealthRules,
  checkin?: typeof CHECKIN_ON,
) {
  return run(input, rules, checkin).reasons.find((r) => r.rule === rule)?.level ?? null;
}

const overdue = (days: number, status: HealthTaskInput['status'] = 'open'): HealthTaskInput => ({
  ...futureTask,
  status,
  dueAt: ago(days),
});

describe('evaluateHealth — base cases', () => {
  it('a fresh, busy student is green with no reasons', () => {
    expect(run(base())).toEqual({ status: 'green', reasons: [], churnRisk: false });
  });

  it.each([
    ['paused', 'paused'],
    ['graduated', 'untracked'],
    ['dropped', 'untracked'],
  ] as const)('lifecycle %s → %s, no rules run', (lifecycle, status) => {
    const result = run(base({ lifecycleStatus: lifecycle, lastActivityAt: ago(100) }));
    expect(result).toEqual({ status, reasons: [], churnRisk: false });
  });
});

describe('R-INACT (≥ 7 yellow, ≥ 14 red; ball = student)', () => {
  it.each([
    [6.9, null],
    [7, 'yellow'],
    [13.9, 'yellow'],
    [14, 'red'],
    [40, 'red'],
  ])('%f days without activity → %s', (days, want) => {
    expect(levelOf(base({ lastActivityAt: ago(days), joinedAt: ago(60) }), 'R-INACT')).toBe(want);
  });

  it('without any activity the base is joined_at', () => {
    expect(levelOf(base({ lastActivityAt: null, joinedAt: ago(8) }), 'R-INACT')).toBe('yellow');
    expect(levelOf(base({ lastActivityAt: null, joinedAt: ago(3) }), 'R-INACT')).toBeNull();
  });

  it('reports whole days and the student ball', () => {
    const reason = run(base({ lastActivityAt: ago(9.6), joinedAt: ago(60) })).reasons[0];
    expect(reason).toEqual({
      rule: 'R-INACT',
      level: 'yellow',
      ball: 'student',
      facts: { days: 9 },
    });
  });
});

describe('R-STALL (> 1.5× yellow, > 2× red; ball = both)', () => {
  it.each([
    [15, null],
    [15.1, 'yellow'],
    [20, 'yellow'],
    [20.1, 'red'],
  ])('%f days in a 10-day stage → %s', (days, want) => {
    expect(levelOf(base({ stageEnteredAt: ago(days) }), 'R-STALL')).toBe(want);
  });

  it('does not run without expected days or in an open-ended stage', () => {
    expect(
      levelOf(
        base({ stageEnteredAt: ago(90), stage: { expectedDays: null, isOpenEnded: false } }),
        'R-STALL',
      ),
    ).toBeNull();
    expect(
      levelOf(
        base({ stageEnteredAt: ago(90), stage: { expectedDays: 10, isOpenEnded: true } }),
        'R-STALL',
      ),
    ).toBeNull();
  });

  it('facts carry days in stage and expected days', () => {
    const reason = run(base({ stageEnteredAt: ago(25) })).reasons.find((r) => r.rule === 'R-STALL');
    expect(reason).toMatchObject({ ball: 'both', facts: { daysInStage: 25, expectedDays: 10 } });
  });

  it('several courses: the phase furthest past its expected days wins (sprint 5c)', () => {
    const input = base({
      phases: [
        { enteredAt: ago(12), expectedDays: 10, isOpenEnded: false },
        { enteredAt: ago(25), expectedDays: 10, isOpenEnded: true },
        { enteredAt: ago(9), expectedDays: 4, isOpenEnded: false },
      ],
    });
    const reason = run(input).reasons.find((r) => r.rule === 'R-STALL');
    expect(reason).toMatchObject({ level: 'red', facts: { daysInStage: 9, expectedDays: 4 } });
    expect(levelOf(base({ phases: [] }), 'R-STALL')).toBeNull();
  });
});

describe('R-OVERDUE (one > 3 yellow; one > 7 or 2 overdue red; ball = student)', () => {
  it.each([
    [[3], null],
    [[3.1], 'yellow'],
    [[7], 'yellow'],
    [[7.1], 'red'],
    [[0.5, 0.5], 'red'],
    [[0.5], null],
  ])('overdue days %j → %s', (list, want) => {
    expect(levelOf(base({ openTasks: list.map((d) => overdue(d)) }), 'R-OVERDUE')).toBe(want);
  });

  it('submitted tasks are not overdue (the ball is with the reviewer)', () => {
    expect(
      levelOf(base({ openTasks: [overdue(9, 'submitted'), overdue(9, 'submitted')] }), 'R-OVERDUE'),
    ).toBeNull();
  });

  it('in_progress and changes_requested count', () => {
    expect(
      levelOf(
        base({ openTasks: [overdue(4, 'in_progress'), overdue(1, 'changes_requested')] }),
        'R-OVERDUE',
      ),
    ).toBe('red');
  });

  it('redCountMinDays raises the bar for the «2 overdue» part', () => {
    const rules = {
      ...DEFAULT_HEALTH_RULES,
      overdue: { ...DEFAULT_HEALTH_RULES.overdue, redCountMinDays: 1 },
    };
    expect(
      levelOf(base({ openTasks: [overdue(0.5), overdue(0.5)] }), 'R-OVERDUE', rules),
    ).toBeNull();
    expect(levelOf(base({ openTasks: [overdue(1.5), overdue(1.5)] }), 'R-OVERDUE', rules)).toBe(
      'red',
    );
  });

  it('facts: count and the longest delay', () => {
    const reason = run(base({ openTasks: [overdue(9.4), overdue(1)] })).reasons[0];
    expect(reason).toEqual({
      rule: 'R-OVERDUE',
      level: 'red',
      ball: 'student',
      facts: { overdueCount: 2, maxOverdueDays: 9 },
    });
  });
});

describe('R-LOOP (≥ 3 yellow, ≥ 4 red; ball = both)', () => {
  it.each([
    [2, null],
    [3, 'yellow'],
    [4, 'red'],
    [7, 'red'],
  ])('%i revisions → %s', (revisions, want) => {
    expect(
      levelOf(base({ openTasks: [{ ...futureTask, revisionCount: revisions }] }), 'R-LOOP'),
    ).toBe(want);
  });
});

describe('R-NOTASK (≥ 3 yellow, ≥ 7 red; ball = team)', () => {
  it.each([
    [2.9, null],
    [3, 'yellow'],
    [6.9, 'yellow'],
    [7, 'red'],
  ])('%f days without an open task → %s', (days, want) => {
    expect(
      levelOf(base({ openTasks: [], joinedAt: ago(30), stageEnteredAt: ago(days) }), 'R-NOTASK'),
    ).toBe(want);
  });

  it('counts from the latest of joined, stage entry and last closed task', () => {
    const input = base({
      openTasks: [],
      joinedAt: ago(30),
      stageEnteredAt: ago(20),
      lastTaskClosedAt: ago(1),
    });
    expect(levelOf(input, 'R-NOTASK')).toBeNull();
    expect(
      run(base({ openTasks: [], joinedAt: ago(30), stageEnteredAt: ago(20) })).reasons,
    ).toContainEqual({
      rule: 'R-NOTASK',
      level: 'red',
      ball: 'team',
      facts: { days: 20 },
    });
  });

  it('several courses: skipped only when every current phase is open-ended (sprint 5c)', () => {
    const openEnded = { enteredAt: ago(30), expectedDays: null, isOpenEnded: true };
    expect(
      levelOf(
        base({ openTasks: [], joinedAt: ago(30), phases: [openEnded, openEnded] }),
        'R-NOTASK',
      ),
    ).toBeNull();
    expect(
      levelOf(
        base({
          openTasks: [],
          joinedAt: ago(30),
          phases: [openEnded, { enteredAt: ago(4), expectedDays: 10, isOpenEnded: false }],
        }),
        'R-NOTASK',
      ),
    ).toBe('yellow');
    expect(levelOf(base({ openTasks: [], joinedAt: ago(8), phases: [] }), 'R-NOTASK')).toBe('red');
  });

  it('a submitted task is still open; an open-ended stage skips the rule', () => {
    expect(
      levelOf(base({ openTasks: [overdue(-2, 'submitted')], stageEnteredAt: ago(9) }), 'R-NOTASK'),
    ).toBeNull();
    expect(
      levelOf(
        base({
          openTasks: [],
          stageEnteredAt: ago(30),
          stage: { expectedDays: null, isOpenEnded: true },
        }),
        'R-NOTASK',
      ),
    ).toBeNull();
  });
});

describe('R-EXTEND (≥ 3 yellow only; ball = student)', () => {
  it.each([
    [2, null],
    [3, 'yellow'],
    [9, 'yellow'],
  ])('%i extensions → %s', (n, want) => {
    expect(levelOf(base({ openTasks: [{ ...futureTask, extensionCount: n }] }), 'R-EXTEND')).toBe(
      want,
    );
  });
});

describe('R-FLAG (level of the worst active flag; no ball)', () => {
  it('a yellow flag → yellow, any red flag → red', () => {
    expect(levelOf(base({ flags: [{ level: 'yellow', category: 'personal' }] }), 'R-FLAG')).toBe(
      'yellow',
    );
    const result = run(
      base({
        flags: [
          { level: 'yellow', category: 'personal' },
          { level: 'red', category: 'financial' },
        ],
      }),
    );
    expect(result.status).toBe('red');
    expect(result.reasons[0]).toEqual({
      rule: 'R-FLAG',
      level: 'red',
      ball: null,
      facts: { count: 2, categories: ['personal', 'financial'] },
    });
  });
});

describe('R-CHECKIN (consecutive closed weeks without a check-in: 1 yellow, ≥ 2 red)', () => {
  const longAgo = { joinedAt: ago(60), activeSince: ago(60) };

  it('does nothing while the check-in is off', () => {
    expect(levelOf(base(longAgo), 'R-CHECKIN')).toBeNull();
  });

  it.each([
    [['2026-10-10'], null],
    [['2026-10-03'], 'yellow'],
    [['2026-09-26'], 'red'],
    [[], 'red'],
    [['2026-10-17'], 'red'],
  ])('check-ins of weeks %j → %s', (weeks, want) => {
    const checkins = weeks.map((weekStart) => ({ weekStart, mood: 4 }));
    expect(levelOf(base({ ...longAgo, checkins }), 'R-CHECKIN', undefined, CHECKIN_ON)).toBe(want);
  });

  it('weeks before the active period do not count (new or returning student)', () => {
    // Joined last Monday: last week's Thursday window was after joining → 1 week missed.
    expect(
      levelOf(base({ joinedAt: ago(8), activeSince: ago(8) }), 'R-CHECKIN', undefined, CHECKIN_ON),
    ).toBe('yellow');
    // Joined on Friday (after the window opened) → nothing missed yet.
    expect(
      levelOf(base({ joinedAt: ago(4), activeSince: ago(4) }), 'R-CHECKIN', undefined, CHECKIN_ON),
    ).toBeNull();
    // Back from a pause yesterday.
    expect(
      levelOf(base({ joinedAt: ago(90), activeSince: ago(1) }), 'R-CHECKIN', undefined, CHECKIN_ON),
    ).toBeNull();
  });

  it('missedCheckinWeeks counts and stops at the first check-in', () => {
    expect(
      missedCheckinWeeks(
        { checkins: [{ weekStart: '2026-09-19', mood: 3 }], activeSince: ago(60) },
        { weekday: 'thu' },
        NOW,
      ),
    ).toBe(3);
  });
});

describe('R-MOOD (latest mood ≤ 2 yellow; two weeks in a row red)', () => {
  const longAgo = { joinedAt: ago(60), activeSince: ago(60) };
  const moods = (pairs: Array<[string, number]>) =>
    pairs.map(([weekStart, mood]) => ({ weekStart, mood }));

  it.each([
    [[['2026-10-17', 2]], 'yellow'],
    [[['2026-10-17', 3]], null],
    [[['2026-10-10', 1]], 'yellow'],
    [
      [
        ['2026-10-17', 1],
        ['2026-10-10', 2],
      ],
      'red',
    ],
    [
      [
        ['2026-10-17', 3],
        ['2026-10-10', 1],
      ],
      null,
    ],
    [
      [
        ['2026-10-17', 2],
        ['2026-10-03', 2],
      ],
      'yellow',
    ],
    [[['2026-10-03', 1]], null],
  ] as Array<[Array<[string, number]>, string | null]>)('check-ins %j → %s', (pairs, want) => {
    expect(
      levelOf(base({ ...longAgo, checkins: moods(pairs) }), 'R-MOOD', undefined, CHECKIN_ON),
    ).toBe(want);
  });

  it('lowMoodStreak reports the mood and the streak', () => {
    expect(
      lowMoodStreak(
        moods([
          ['2026-10-17', 1],
          ['2026-10-10', 2],
          ['2026-10-03', 2],
        ]),
        2,
        NOW,
      ),
    ).toEqual({
      mood: 1,
      weeks: 3,
    });
  });

  it('does nothing while the check-in is off', () => {
    expect(levelOf(base({ checkins: moods([['2026-10-17', 1]]) }), 'R-MOOD')).toBeNull();
  });
});

describe('combination', () => {
  it('status = the worst rule; reasons red first, then table order', () => {
    const result = run(
      base({
        joinedAt: ago(60),
        lastActivityAt: ago(8),
        stageEnteredAt: ago(25),
        openTasks: [{ ...futureTask, revisionCount: 3, extensionCount: 3 }],
      }),
    );
    expect(result.status).toBe('red');
    expect(result.reasons.map((r) => `${r.rule}:${r.level}`)).toEqual([
      'R-STALL:red',
      'R-INACT:yellow',
      'R-LOOP:yellow',
      'R-EXTEND:yellow',
    ]);
  });

  it('only yellow rules → yellow', () => {
    expect(run(base({ joinedAt: ago(60), lastActivityAt: ago(8) })).status).toBe('yellow');
  });

  it('churn risk: two of R-INACT, R-CHECKIN, R-MOOD (any level) → red', () => {
    const result = run(
      base({
        joinedAt: ago(60),
        activeSince: ago(60),
        lastActivityAt: ago(8),
        checkins: [{ weekStart: '2026-10-03', mood: 4 }],
      }),
      DEFAULT_HEALTH_RULES,
      CHECKIN_ON,
    );
    expect(result.reasons.every((r) => r.level === 'yellow')).toBe(true);
    expect(result).toMatchObject({ status: 'red', churnRisk: true });
  });

  it('one churn rule alone is not churn risk', () => {
    const result = run(
      base({
        joinedAt: ago(60),
        activeSince: ago(60),
        checkins: [{ weekStart: '2026-10-03', mood: 4 }],
      }),
      DEFAULT_HEALTH_RULES,
      CHECKIN_ON,
    );
    expect(result).toMatchObject({ status: 'yellow', churnRisk: false });
  });

  it('thresholds come from the settings (minRules = 1 makes any churn rule red)', () => {
    const rules: HealthRules = {
      ...DEFAULT_HEALTH_RULES,
      inactivity: { yellowDays: 2, redDays: 30 },
      churnRisk: { minRules: 1 },
    };
    const result = run(base({ joinedAt: ago(60), lastActivityAt: ago(3) }), rules);
    expect(result).toMatchObject({ status: 'red', churnRisk: true });
    expect(result.reasons[0]?.level).toBe('yellow');
  });
});

describe('helpers', () => {
  it('weekStartOf gives the Saturday of the Tehran week', () => {
    expect(weekStartOf('2026-10-17')).toBe('2026-10-17');
    expect(weekStartOf('2026-10-23')).toBe('2026-10-17');
    expect(weekStartOf('2026-10-24')).toBe('2026-10-24');
    expect(currentWeekStart(NOW)).toBe('2026-10-17');
  });

  it('overallBall: worst level decides; mixed → both; flags only → null', () => {
    expect(overallBall([])).toBeNull();
    expect(overallBall([{ level: 'yellow', ball: 'student' }])).toBe('student');
    expect(
      overallBall([
        { level: 'red', ball: 'team' },
        { level: 'yellow', ball: 'student' },
      ]),
    ).toBe('team');
    expect(
      overallBall([
        { level: 'yellow', ball: 'team' },
        { level: 'yellow', ball: 'student' },
      ]),
    ).toBe('both');
    expect(overallBall([{ level: 'red', ball: null }])).toBeNull();
  });

  it('reasonSignature ignores order and facts', () => {
    expect(
      reasonSignature([
        { rule: 'R-LOOP', level: 'yellow' },
        { rule: 'R-INACT', level: 'red' },
      ]),
    ).toBe(
      reasonSignature([
        { rule: 'R-INACT', level: 'red' },
        { rule: 'R-LOOP', level: 'yellow' },
      ]),
    );
  });
});
