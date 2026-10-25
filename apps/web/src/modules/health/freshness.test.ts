import { describe, expect, it } from 'vitest';
import { HEALTH_STALE_AFTER_MS, isHealthStale } from './recompute';

describe('health freshness (ADR-0005, F-08, F-14)', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('is stale only when the oldest result is older than 3 hours', () => {
    expect(HEALTH_STALE_AFTER_MS).toBe(3 * 3600 * 1000);
    expect(isHealthStale(ago(HEALTH_STALE_AFTER_MS), now)).toBe(false);
    expect(isHealthStale(ago(HEALTH_STALE_AFTER_MS + 1000), now)).toBe(true);
    expect(isHealthStale(ago(60_000), now)).toBe(false);
  });

  it('no results at all (empty install) is not stale', () => {
    expect(isHealthStale(null, now)).toBe(false);
  });
});
