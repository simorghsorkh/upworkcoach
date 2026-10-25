import { describe, expect, it } from 'vitest';
import { secretMatches } from '@/server/jobs/trigger';
import {
  DEFAULT_HEALTH_RULES,
  healthRulesSchema,
  SETTINGS_DEFAULTS,
  SETTINGS_KEYS,
  SETTINGS_SCHEMAS,
  updateSettingsInput,
} from '../catalog/contracts';
import { median } from '../milestones/policy';
import { buildCounts } from '../students/policy';
import type { StoredHealthReason } from './schema';
import { toHealthSummary } from './summary';

describe('buildCounts (student list chips)', () => {
  const rows = [
    { lifecycleStatus: 'active' as const, healthStatus: 'red', count: 2 },
    { lifecycleStatus: 'active' as const, healthStatus: 'green', count: 3 },
    { lifecycleStatus: 'paused' as const, healthStatus: 'paused', count: 1 },
    { lifecycleStatus: 'graduated' as const, healthStatus: 'untracked', count: 4 },
    { lifecycleStatus: 'active' as const, healthStatus: null, count: 1 },
  ];

  it('without a health filter: lifecycle counters ignore the lifecycle filter', () => {
    expect(buildCounts(rows, ['active', 'paused'], undefined)).toEqual({
      total: 7,
      byLifecycle: { active: 6, paused: 1, graduated: 4, dropped: 0 },
      byHealth: { green: 3, yellow: 0, red: 2, paused: 1, untracked: 0, none: 1 },
    });
  });

  it('with a health filter: health counters ignore it, lifecycle counters respect it', () => {
    expect(buildCounts(rows, ['active'], ['red'])).toEqual({
      total: 2,
      byLifecycle: { active: 2, paused: 0, graduated: 0, dropped: 0 },
      byHealth: { green: 3, yellow: 0, red: 2, paused: 0, untracked: 0, none: 1 },
    });
  });
});

describe('median (North Star)', () => {
  it.each([
    [[], null],
    [[5], 5],
    [[9, 1, 5], 5],
    [[1, 2, 3, 10], 2.5],
  ])('%j → %s', (values, want) => {
    expect(median(values)).toBe(want);
  });
});

describe('job trigger secret (SEC-J1, SEC-J2)', () => {
  const secret = 's'.repeat(40);
  it('only the exact secret of at least 32 characters matches', () => {
    expect(secretMatches(secret, secret)).toBe(true);
    expect(secretMatches(`${secret}x`, secret)).toBe(false);
    expect(secretMatches(null, secret)).toBe(false);
    expect(secretMatches('', '')).toBe(false);
    expect(secretMatches('short', 'short')).toBe(false);
    expect(secretMatches('x', undefined)).toBe(false);
  });
});

describe('settings schemas', () => {
  it('every default passes its own schema; PUT /settings is strict', () => {
    for (const key of SETTINGS_KEYS) {
      expect(SETTINGS_SCHEMAS[key].safeParse(SETTINGS_DEFAULTS[key]).success, key).toBe(true);
    }
    expect(updateSettingsInput.safeParse({ nope: 1 }).success).toBe(false);
    expect(updateSettingsInput.safeParse({}).success).toBe(true);
  });

  it('health.rules: red below yellow and unknown keys are refused', () => {
    expect(
      healthRulesSchema.safeParse({
        ...DEFAULT_HEALTH_RULES,
        loop: { yellowRevisions: 4, redRevisions: 3 },
      }).success,
    ).toBe(false);
    expect(healthRulesSchema.safeParse({ ...DEFAULT_HEALTH_RULES, extra: 1 }).success).toBe(false);
  });
});

describe('toHealthSummary', () => {
  const reasons: StoredHealthReason[] = [
    { rule: 'R-OVERDUE', level: 'red', ball: 'student', facts: { overdueCount: 2 } },
    { rule: 'R-OLD-1.0', level: 'yellow', ball: null, facts: {} },
  ];
  const base = {
    healthStatus: 'red' as const,
    healthReasons: reasons,
    healthChurnRisk: false,
    healthStatusSince: new Date('2026-10-01T00:00:00Z'),
    healthComputedAt: new Date('2026-10-20T00:00:00Z'),
  };

  it('null before the first computation; unknown rules dropped; past snooze hidden', () => {
    expect(toHealthSummary({ ...base, healthStatus: null, healthSnoozedUntil: null })).toBeNull();
    const now = new Date('2026-10-20T10:00:00Z');
    const summary = toHealthSummary(
      { ...base, healthSnoozedUntil: new Date('2026-10-19T00:00:00Z') },
      now,
    );
    expect(summary).toMatchObject({ status: 'red', ball: 'student', snoozedUntil: null });
    expect(summary?.reasons.map((r) => r.rule)).toEqual(['R-OVERDUE']);
    expect(
      toHealthSummary({ ...base, healthSnoozedUntil: new Date('2026-10-25T00:00:00Z') }, now)
        ?.snoozedUntil,
    ).toBe('2026-10-25T00:00:00.000Z');
  });
});
