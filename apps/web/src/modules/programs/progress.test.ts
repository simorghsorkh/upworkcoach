import { describe, expect, it } from 'vitest';
import {
  assignmentDueDay,
  averagePercent,
  computeProgress,
  goalProgress,
  isNodeDone,
  type ProgressFacts,
  type ProgressNode,
  packageUsage,
  type UsageSession,
} from './progress';

const node = (id: string, nodeType: ProgressNode['nodeType'], extra: Partial<ProgressNode> = {}) =>
  ({
    id,
    nodeType,
    isRequired: true,
    checklistItems: [],
    milestoneTypeId: null,
    ...extra,
  }) as const;

const facts = (extra: Partial<ProgressFacts> = {}): ProgressFacts => ({
  acceptedNodeIds: new Set(),
  completions: new Map(),
  approvedMilestoneTypeIds: new Set(),
  ...extra,
});

type Completion = { checklistState: readonly boolean[]; completedAt: Date | null };
const done: Completion = { checklistState: [], completedAt: new Date('2026-10-20T10:00:00Z') };

describe('isNodeDone (ADR-0012 section 6)', () => {
  it('assignment: only an accepted task counts', () => {
    expect(isNodeDone(node('a', 'assignment'), facts())).toBe(false);
    expect(isNodeDone(node('a', 'assignment'), facts({ acceptedNodeIds: new Set(['a']) }))).toBe(
      true,
    );
  });

  it('lesson and resource: a completion row with completed_at', () => {
    const f = facts({
      completions: new Map<string, Completion>([
        ['l', done],
        ['r', { checklistState: [], completedAt: null }],
      ]),
    });
    expect(isNodeDone(node('l', 'lesson'), f)).toBe(true);
    expect(isNodeDone(node('r', 'resource'), f)).toBe(false);
  });

  it('checklist: every item ticked; without items, marked done', () => {
    const items = ['x', 'y', 'z'];
    const partly = facts({
      completions: new Map<string, Completion>([
        ['c', { checklistState: [true, false, true], completedAt: null }],
      ]),
    });
    const all = facts({
      completions: new Map<string, Completion>([
        ['c', { checklistState: [true, true, true], completedAt: null }],
      ]),
    });
    expect(isNodeDone(node('c', 'checklist', { checklistItems: items }), partly)).toBe(false);
    expect(isNodeDone(node('c', 'checklist', { checklistItems: items }), all)).toBe(true);
    expect(
      isNodeDone(
        node('c', 'checklist'),
        facts({ completions: new Map<string, Completion>([['c', done]]) }),
      ),
    ).toBe(true);
    // A shorter state (an item added to the run later) is not complete.
    const short = facts({
      completions: new Map<string, Completion>([
        ['c', { checklistState: [true, true], completedAt: null }],
      ]),
    });
    expect(isNodeDone(node('c', 'checklist', { checklistItems: items }), short)).toBe(false);
  });

  it('milestone: an approved milestone of its type, or marked done when it has no type', () => {
    const typed = node('m', 'milestone', { milestoneTypeId: 'first-contract' });
    expect(isNodeDone(typed, facts())).toBe(false);
    expect(
      isNodeDone(typed, facts({ approvedMilestoneTypeIds: new Set(['first-contract']) })),
    ).toBe(true);
    // A completion row does not stand in for the approved milestone.
    expect(
      isNodeDone(typed, facts({ completions: new Map<string, Completion>([['m', done]]) })),
    ).toBe(false);
    expect(
      isNodeDone(
        node('m', 'milestone'),
        facts({ completions: new Map<string, Completion>([['m', done]]) }),
      ),
    ).toBe(true);
  });

  it('a phase is never an activity', () => {
    expect(
      isNodeDone(
        node('p', 'phase'),
        facts({ completions: new Map<string, Completion>([['p', done]]) }),
      ),
    ).toBe(false);
  });
});

describe('computeProgress', () => {
  const nodes = [
    node('p1', 'phase'),
    node('l1', 'lesson'),
    node('a1', 'assignment'),
    node('c1', 'checklist', { checklistItems: ['x'] }),
    node('o1', 'resource', { isRequired: false }),
  ];

  it('counts required activities only, phases excluded', () => {
    expect(computeProgress(nodes, facts())).toEqual({ done: 0, total: 3, percent: 0 });
    const f = facts({
      acceptedNodeIds: new Set(['a1']),
      completions: new Map<string, Completion>([
        ['l1', done],
        ['o1', done],
      ]),
    });
    expect(computeProgress(nodes, f)).toEqual({ done: 2, total: 3, percent: 66 });
  });

  it('100 only when everything required is done', () => {
    const f = facts({
      acceptedNodeIds: new Set(['a1']),
      completions: new Map<string, Completion>([
        ['l1', done],
        ['c1', { checklistState: [true], completedAt: null }],
      ]),
    });
    expect(computeProgress(nodes, f)).toEqual({ done: 3, total: 3, percent: 100 });
  });

  it('no required activity → unknown, not 0% or 100%', () => {
    expect(computeProgress([node('p1', 'phase')], facts())).toEqual({
      done: 0,
      total: 0,
      percent: null,
    });
    expect(computeProgress([node('o', 'lesson', { isRequired: false })], facts()).percent).toBe(
      null,
    );
  });

  it('averagePercent leaves the unknown ones out', () => {
    expect(
      averagePercent([
        { done: 1, total: 2, percent: 50 },
        { done: 0, total: 0, percent: null },
        { done: 2, total: 2, percent: 100 },
      ]),
    ).toBe(75);
    expect(averagePercent([{ done: 0, total: 0, percent: null }])).toBe(null);
    expect(averagePercent([])).toBe(null);
  });
});

describe('assignmentDueDay', () => {
  const phases = [
    { id: 'p1', expectedDays: 14, isOpenEnded: false },
    { id: 'p2', expectedDays: null, isOpenEnded: true },
    { id: 'p3', expectedDays: 7, isOpenEnded: false },
  ];
  const base = { phases, fallbackDays: 7, today: '2026-10-01' };

  it('phase start = run start + typical days of the earlier phases; plus the offset', () => {
    expect(
      assignmentDueDay({ ...base, runStartsOn: '2026-10-10', phaseId: 'p1', dueOffsetDays: 3 }),
    ).toBe('2026-10-13');
    // p2 starts after p1's 14 days; open-ended p2 adds nothing before p3.
    expect(
      assignmentDueDay({ ...base, runStartsOn: '2026-10-10', phaseId: 'p3', dueOffsetDays: 0 }),
    ).toBe('2026-10-24');
  });

  it('no offset → the fallback; no run start → today', () => {
    expect(
      assignmentDueDay({ ...base, runStartsOn: null, phaseId: 'p1', dueOffsetDays: null }),
    ).toBe('2026-10-08');
  });

  it('a day in the past moves to today', () => {
    expect(
      assignmentDueDay({
        ...base,
        today: '2026-12-01',
        runStartsOn: '2026-10-10',
        phaseId: 'p1',
        dueOffsetDays: 3,
      }),
    ).toBe('2026-12-01');
  });
});

describe('goalProgress (one-on-one)', () => {
  it('achieved / not dropped; nothing to count → unknown', () => {
    expect(goalProgress(['achieved', 'open', 'dropped', 'achieved'])).toEqual({
      done: 2,
      total: 3,
      percent: 66,
    });
    expect(goalProgress(['dropped'])).toEqual({ done: 0, total: 0, percent: null });
    expect(goalProgress([])).toEqual({ done: 0, total: 0, percent: null });
  });
});

describe('packageUsage', () => {
  const s = (status: UsageSession['status'], countsTowardQuota = true): UsageSession => ({
    status,
    countsTowardQuota,
  });

  it('held and no-show count; scheduled, cancelled and excused ones do not', () => {
    const u = packageUsage({
      quota: 8,
      validUntil: '2026-12-01',
      sessions: [s('held'), s('no_show'), s('scheduled'), s('cancelled'), s('held', false)],
      today: '2026-11-19',
    });
    expect(u).toEqual({
      quota: 8,
      used: 2,
      remaining: 6,
      validUntil: '2026-12-01',
      daysLeft: 12,
      overQuota: false,
      expired: false,
    });
  });

  it('over the quota and past the last day only warn', () => {
    const u = packageUsage({
      quota: 1,
      validUntil: '2026-11-01',
      sessions: [s('held'), s('held')],
      today: '2026-11-02',
    });
    expect(u.remaining).toBe(0);
    expect(u.overQuota).toBe(true);
    expect(u.daysLeft).toBe(-1);
    expect(u.expired).toBe(true);
  });

  it('no quota and no end date', () => {
    const u = packageUsage({
      quota: null,
      validUntil: null,
      sessions: [s('held')],
      today: '2026-11-02',
    });
    expect(u).toMatchObject({
      used: 1,
      remaining: null,
      daysLeft: null,
      overQuota: false,
      expired: false,
    });
  });
});
