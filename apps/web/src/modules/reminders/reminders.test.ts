import { describe, expect, it } from 'vitest';
import { createReminderInput, snoozeReminderInput } from './contracts';
import { dueFrom, snoozedDueAt } from './service';

describe('reminder due time (data-model.md 2-7)', () => {
  it('a day means 09:00 Tehran', () => {
    expect(dueFrom({ dueDate: '2026-10-22' })?.toISOString()).toBe('2026-10-22T05:30:00.000Z');
    const at = new Date('2026-10-22T10:00:00Z');
    expect(dueFrom({ dueAt: at })).toBe(at);
  });

  it('exactly one of dueAt and dueDate', () => {
    expect(createReminderInput.safeParse({ text: 'x' }).success).toBe(false);
    expect(
      createReminderInput.safeParse({
        text: 'x',
        dueDate: '2026-10-22',
        dueAt: '2026-10-22T10:00:00Z',
      }).success,
    ).toBe(false);
    expect(createReminderInput.safeParse({ text: 'x', dueDate: '2026-10-22' }).success).toBe(true);
  });
});

describe('snooze (F6: 1 day, 3 days, 1 week)', () => {
  it('only 1, 3 or 7 (Persian digits accepted)', () => {
    expect(snoozeReminderInput.safeParse({ days: 1 }).success).toBe(true);
    expect(snoozeReminderInput.parse({ days: '۷' }).days).toBe(7);
    expect(snoozeReminderInput.safeParse({ days: 2 }).success).toBe(false);
    expect(snoozeReminderInput.safeParse({ days: 30 }).success).toBe(false);
  });

  it('counts from the later of now and the due time', () => {
    const now = new Date('2026-10-20T08:00:00Z');
    const past = new Date('2026-10-18T05:30:00Z');
    const future = new Date('2026-10-25T05:30:00Z');
    expect(snoozedDueAt(past, 1, now).toISOString()).toBe('2026-10-21T08:00:00.000Z');
    expect(snoozedDueAt(future, 3, now).toISOString()).toBe('2026-10-28T05:30:00.000Z');
  });
});
