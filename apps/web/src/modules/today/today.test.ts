import { describe, expect, it } from 'vitest';
import type { WaitingOnUsItemDTO } from './contracts';
import { sortWaiting } from './service';

const item = (refId: string, breached: boolean, remainingHours: number): WaitingOnUsItemDTO => ({
  kind: 'review',
  studentId: 's',
  refId,
  since: '2026-10-20T08:00:00.000Z',
  slaHours: 48,
  elapsedHours: 48 - remainingHours,
  remainingHours,
  breached,
  warning: false,
});

describe('«منتظر ما» order', () => {
  it('breached first (most overdue first), then the least time left', () => {
    const sorted = sortWaiting([
      item('fresh', false, 40),
      item('late', true, -2),
      item('urgent', false, 3),
      item('later', true, -20),
    ]);
    expect(sorted.map((i) => i.refId)).toEqual(['later', 'late', 'urgent', 'fresh']);
  });
});
