import { addDays, dateTimeIn, dayIn, type Weekday, weekdayOf } from '../../lib/org-day';

/**
 * Free slots of one mentor for one offering (ADR-0014). Pure: the caller loads the rules, the
 * exceptions and the busy intervals. Slots are never stored.
 *
 *   windows  = a date with rows of its own (sprint 7b): its `hours` rows open to the offering,
 *              or nothing when the row is `off`; any other date: the weekly rules of that
 *              weekday open to the offering
 *   slot     = a start every `stepMinutes` from the start of a window, the session fitting in it
 *   free     = not sooner than `minNoticeHours`, not later than `horizonDays`, and at least
 *              `bufferMinutes` away from every busy interval (sessions of any kind, held requests)
 *
 * Times are wall clock in the organization's zone; daylight-saving days use the zone's offset
 * at each slot (lib/org-day).
 */

export type Range = { start: number; end: number };

export type RuleInput = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  templateIds: string[];
};

/** One row of a date's own hours: `off` (not available that date) or one `hours` window. */
export type ExceptionInput = {
  day: string;
  kind: 'off' | 'hours';
  startMinute: number | null;
  endMinute: number | null;
  templateIds: string[];
};

export type OfferingInput = {
  templateId: string;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
};

export type Busy = { start: Date; end: Date };

export type Slot = { startsAt: Date; minute: number };
export type DaySlots = { day: string; slots: Slot[] };

export const SLOT_STEP_MINUTES = 30;

/** Sorted union of ranges. */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Bookable windows of one day for one offering. */
export function windowsOf(
  day: string,
  weekday: Weekday,
  templateId: string,
  rules: readonly RuleInput[],
  exceptions: readonly ExceptionInput[],
): Range[] {
  const opensTo = (ids: readonly string[]) => ids.length === 0 || ids.includes(templateId);
  const own = exceptions.filter((e) => e.day === day);
  if (own.length) {
    if (own.some((e) => e.kind === 'off')) return [];
    return mergeRanges(
      own
        .filter((e) => opensTo(e.templateIds) && e.startMinute !== null && e.endMinute !== null)
        .map((e) => ({ start: e.startMinute as number, end: e.endMinute as number })),
    );
  }
  return mergeRanges(
    rules
      .filter((r) => r.weekday === weekday && opensTo(r.templateIds))
      .map((r) => ({ start: r.startMinute, end: r.endMinute })),
  );
}

function clashes(start: Date, end: Date, busy: readonly Busy[], bufferMs: number): boolean {
  return busy.some(
    (b) =>
      start.getTime() < b.end.getTime() + bufferMs && end.getTime() + bufferMs > b.start.getTime(),
  );
}

/** Free slots from today (in `timeZone`) through the offering's horizon. */
export function freeSlots(input: {
  timeZone: string;
  now: Date;
  offering: OfferingInput;
  rules: readonly RuleInput[];
  exceptions: readonly ExceptionInput[];
  busy: readonly Busy[];
  stepMinutes?: number;
}): DaySlots[] {
  const { timeZone, now, offering } = input;
  const step = input.stepMinutes ?? SLOT_STEP_MINUTES;
  const earliest = now.getTime() + offering.minNoticeHours * 3_600_000;
  const bufferMs = offering.bufferMinutes * 60_000;
  const today = dayIn(timeZone, now);
  const out: DaySlots[] = [];
  for (let i = 0; i <= offering.horizonDays; i++) {
    const day = addDays(today, i);
    const windows = windowsOf(
      day,
      weekdayOf(timeZone, day),
      offering.templateId,
      input.rules,
      input.exceptions,
    );
    const slots: Slot[] = [];
    for (const w of windows) {
      for (let m = w.start; m + offering.durationMinutes <= w.end; m += step) {
        const startsAt = dateTimeIn(timeZone, day, Math.floor(m / 60), m % 60);
        if (startsAt.getTime() < earliest) continue;
        const end = new Date(startsAt.getTime() + offering.durationMinutes * 60_000);
        if (clashes(startsAt, end, input.busy, bufferMs)) continue;
        slots.push({ startsAt, minute: m });
      }
    }
    out.push({ day, slots });
  }
  return out;
}

/** Whether `startsAt` is one of the free slots (re-checked inside the booking transaction). */
export function isFreeSlot(startsAt: Date, input: Parameters<typeof freeSlots>[0]): boolean {
  return freeSlots(input).some((d) =>
    d.slots.some((s) => s.startsAt.getTime() === startsAt.getTime()),
  );
}
