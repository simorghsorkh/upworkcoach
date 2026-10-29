import { describe, expect, it } from 'vitest';
import { dateTimeIn } from '../../lib/org-day';
import {
  type ExceptionInput,
  freeSlots,
  isFreeSlot,
  mergeRanges,
  type OfferingInput,
  type RuleInput,
  windowsOf,
} from './slots';

const TZ = 'Asia/Tehran';
// Thursday 1405/08/07, 09:30 in Tehran.
const NOW = new Date('2026-10-29T06:00:00Z');
const SAT = '2026-10-31';
const SUN = '2026-11-01';
const T = 'tpl-1';

const offering = (o: Partial<OfferingInput> = {}): OfferingInput => ({
  templateId: T,
  durationMinutes: 60,
  bufferMinutes: 0,
  minNoticeHours: 0,
  horizonDays: 7,
  ...o,
});

const rule = (r: Partial<RuleInput> = {}): RuleInput => ({
  weekday: 'sat',
  startMinute: 17 * 60,
  endMinute: 20 * 60,
  templateIds: [],
  ...r,
});

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function timesOn(day: string, input: Parameters<typeof freeSlots>[0]): string[] {
  return (freeSlots(input).find((d) => d.day === day)?.slots ?? []).map((s) => hhmm(s.minute));
}

const base = (o: Partial<Parameters<typeof freeSlots>[0]> = {}) => ({
  timeZone: TZ,
  now: NOW,
  offering: offering(),
  rules: [rule()],
  exceptions: [] as ExceptionInput[],
  busy: [],
  ...o,
});

describe('ranges', () => {
  it('merges overlapping and touching ranges', () => {
    expect(
      mergeRanges([
        { start: 600, end: 660 },
        { start: 540, end: 600 },
        { start: 700, end: 720 },
      ]),
    ).toEqual([
      { start: 540, end: 660 },
      { start: 700, end: 720 },
    ]);
  });
});

describe('windows of a day', () => {
  it('a rule open to some templates only', () => {
    expect(windowsOf(SAT, 'sat', T, [rule({ templateIds: ['other'] })], [])).toEqual([]);
    expect(windowsOf(SAT, 'sat', T, [rule({ templateIds: ['other', T] })], [])).toHaveLength(1);
  });

  const hours = (day: string, start: number, end: number, templateIds: string[] = []) =>
    ({ day, kind: 'hours', startMinute: start, endMinute: end, templateIds }) as ExceptionInput;
  const off = (day: string) =>
    ({ day, kind: 'off', startMinute: null, endMinute: null, templateIds: [] }) as ExceptionInput;

  it('a date marked off has no windows, whatever the week says', () => {
    expect(windowsOf(SAT, 'sat', T, [rule()], [off(SAT)])).toEqual([]);
  });

  it("a date's own hours replace the weekly hours of that date only", () => {
    const ex = [hours(SAT, 600, 660), hours(SAT, 630, 720)];
    expect(windowsOf(SAT, 'sat', T, [rule()], ex)).toEqual([{ start: 600, end: 720 }]);
    const nextSat = '2026-11-07';
    expect(windowsOf(nextSat, 'sat', T, [rule()], ex)).toEqual([{ start: 1020, end: 1200 }]);
  });

  it('a date can open a day the week keeps closed, and limit a window to some types', () => {
    expect(windowsOf(SUN, 'sun', T, [rule()], [hours(SUN, 540, 600)])).toEqual([
      { start: 540, end: 600 },
    ]);
    expect(windowsOf(SUN, 'sun', T, [], [hours(SUN, 540, 600, ['other'])])).toEqual([]);
  });

  it('month by month without any weekly hours', () => {
    const days = freeSlots(base({ rules: [], exceptions: [hours(SUN, 540, 660)] }));
    expect(days.filter((d) => d.slots.length).map((d) => d.day)).toEqual([SUN]);
  });
});

describe('free slots', () => {
  it('every 30 minutes while the session still fits', () => {
    expect(timesOn(SAT, base())).toEqual(['17:00', '17:30', '18:00', '18:30', '19:00']);
    expect(timesOn(SUN, base())).toEqual([]);
  });

  it('slots are instants in the organization zone', () => {
    const sat = freeSlots(base()).find((d) => d.day === SAT);
    expect(sat?.slots[0]?.startsAt.toISOString()).toBe('2026-10-31T13:30:00.000Z');
  });

  it('minimum notice drops the slots too close to now', () => {
    // Saturday 17:00 Tehran is 55.5 hours after now.
    expect(timesOn(SAT, base({ offering: offering({ minNoticeHours: 56 }) }))).toEqual([
      '17:30',
      '18:00',
      '18:30',
      '19:00',
    ]);
  });

  it('the horizon ends the list', () => {
    const days = freeSlots(base({ offering: offering({ horizonDays: 1 }) }));
    expect(days.map((d) => d.day)).toEqual(['2026-10-29', '2026-10-30']);
  });

  it('busy time and its buffer block the slots around it', () => {
    const busy = [{ start: dateTimeIn(TZ, SAT, 18, 0), end: dateTimeIn(TZ, SAT, 19, 0) }];
    expect(timesOn(SAT, base({ busy }))).toEqual(['17:00', '19:00']);
    expect(timesOn(SAT, base({ busy, offering: offering({ bufferMinutes: 15 }) }))).toEqual([]);
    expect(
      timesOn(
        SAT,
        base({
          busy,
          rules: [rule({ endMinute: 21 * 60 })],
          offering: offering({ bufferMinutes: 15 }),
        }),
      ),
    ).toEqual(['19:30', '20:00']);
  });

  it('isFreeSlot accepts only a listed slot', () => {
    expect(isFreeSlot(dateTimeIn(TZ, SAT, 17, 30), base())).toBe(true);
    expect(isFreeSlot(dateTimeIn(TZ, SAT, 17, 15), base())).toBe(false);
    expect(isFreeSlot(dateTimeIn(TZ, SAT, 19, 30), base())).toBe(false);
  });
});
