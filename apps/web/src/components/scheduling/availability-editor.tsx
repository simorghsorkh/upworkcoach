'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/components/api/client';
import { addDaysTo, weekdayIndex } from '@/components/format/jalali';
import { useFormat } from '@/components/format/use-format';
import { CheckboxField } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { dayDate, numberOrNull } from '@/components/programs/program-text';
import { Button } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { ChipButton } from '@/components/ui/choice';
import { cn } from '@/components/ui/cn';
import { SelectField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { dayIn } from '@/lib/org-day';
import type {
  AvailabilityDTO,
  OfferingDTO,
  RuleDTO,
  SlotsDTO,
  WindowDTO,
} from '@/modules/scheduling/contracts';
import { type Month, MonthGrid, monthOf, useDayNumber, WEEK } from './month-grid';
import { clockLabel, SlotCalendar } from './slot-calendar';

/** Half-hour marks of a day, `00:00` … `24:00`. */
const MARKS = Array.from({ length: 49 }, (_, i) => {
  const m = i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});
/** Dates can be planned this far ahead (the longest offering horizon). */
const PLAN_DAYS = 180;
const DEFAULT_WINDOW: WindowDTO = { start: '09:00', end: '12:00', templateIds: [] };

/** `09:00` → `9`, `09:30` → `9:30`: the compact clock of a calendar cell. */
function shortClock(time: string, locale: string): string {
  const [h, m] = time.split(':');
  return clockLabel(m === '00' ? String(Number(h)) : `${Number(h)}:${m}`, locale);
}

function TimeSelect({
  label,
  value,
  onChange,
  from,
  to,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  from: number;
  to: number;
}) {
  const locale = useLocale();
  return (
    <SelectField
      label={label}
      hideLabel
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fieldClassName="mb-0 w-28"
    >
      {MARKS.slice(from, to + 1).map((m) => (
        <option key={m} value={m}>
          {clockLabel(m, locale)}
        </option>
      ))}
    </SelectField>
  );
}

/** One bookable window: from, to, and (with several active types) the types it is open to. */
function WindowRow({
  window: w,
  active,
  typeTitle,
  onChange,
  onRemove,
}: {
  window: WindowDTO;
  active: OfferingDTO[];
  typeTitle: (id: string) => string;
  onChange: (patch: Partial<WindowDTO>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('scheduling.calendar');
  const startIdx = MARKS.indexOf(w.start);
  const endIdx = MARKS.indexOf(w.end);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-fg-3">{t('from')}</span>
      <TimeSelect
        label={t('from')}
        value={w.start}
        from={0}
        to={Math.max(endIdx - 1, 0)}
        onChange={(start) => onChange({ start })}
      />
      <span className="text-sm text-fg-3">{t('to')}</span>
      <TimeSelect
        label={t('to')}
        value={w.end}
        from={startIdx + 1}
        to={48}
        onChange={(end) => onChange({ end })}
      />
      <Button size="sm" variant="ghost" aria-label={t('removeWindow')} onClick={onRemove}>
        <Icon name="x" size={14} />
      </Button>
      {active.length > 1 ? (
        <fieldset
          aria-label={t('typesOf')}
          className="m-0 flex min-w-0 basis-full flex-wrap gap-1.5 border-0 p-0"
        >
          <ChipButton
            small
            pressed={w.templateIds.length === 0}
            onClick={() => onChange({ templateIds: [] })}
          >
            {t('allTypes')}
          </ChipButton>
          {active.map((o) => (
            <ChipButton
              key={o.templateId}
              small
              pressed={w.templateIds.includes(o.templateId)}
              onClick={() =>
                onChange({
                  templateIds: w.templateIds.includes(o.templateId)
                    ? w.templateIds.filter((id) => id !== o.templateId)
                    : [...w.templateIds, o.templateId],
                })
              }
            >
              <bdi>{o.title}</bdi>
            </ChipButton>
          ))}
        </fieldset>
      ) : w.templateIds.length ? (
        <span className="basis-full text-xs text-fg-3">
          {w.templateIds.map(typeTitle).join(' · ')}
        </span>
      ) : null}
    </div>
  );
}

/** A list of windows with "add window"; `next` places a new window after the last one. */
function WindowsEditor({
  windows,
  active,
  typeTitle,
  onChange,
}: {
  windows: WindowDTO[];
  active: OfferingDTO[];
  typeTitle: (id: string) => string;
  onChange: (windows: WindowDTO[]) => void;
}) {
  const t = useTranslations('scheduling.calendar');
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {windows.map((w, index) => (
        <WindowRow
          // biome-ignore lint/suspicious/noArrayIndexKey: windows have no id; order is the identity
          key={index}
          window={w}
          active={active}
          typeTitle={typeTitle}
          onChange={(patch) =>
            onChange(windows.map((x, i) => (i === index ? { ...x, ...patch } : x)))
          }
          onRemove={() => onChange(windows.filter((_, i) => i !== index))}
        />
      ))}
      <div>
        <Button
          size="sm"
          variant="link"
          onClick={() => {
            const last = windows.at(-1);
            const startIdx = last ? Math.min(MARKS.indexOf(last.end) + 2, 46) : 18;
            onChange([
              ...windows,
              {
                start: MARKS[startIdx] as string,
                end: MARKS[Math.min(startIdx + 6, 48)] as string,
                templateIds: [],
              },
            ]);
          }}
        >
          <Icon name="plus" size={14} />
          {t('addWindow')}
        </Button>
      </div>
    </div>
  );
}

/**
 * A mentor's bookable calendar (Coach Office sprints 7 and 7b, ADR-0014): session types they
 * take bookings for; a month calendar where they pick dates and set their hours, month by
 * month; optional repeating weekly hours for dates without hours of their own; and a preview
 * of the free slots a mentee sees.
 */
export function AvailabilityEditor({ initial }: { initial: AvailabilityDTO }) {
  const t = useTranslations('scheduling');
  const format = useFormat();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const dayNumber = useDayNumber();
  const mentorId = initial.mentor.id;
  const today = dayIn(initial.timeZone);
  const [offerings, setOfferings] = useState(initial.offerings);
  const [rules, setRules] = useState<RuleDTO[]>(initial.rules);
  /** Dates with hours of their own; `[]` = closed that date. */
  const [dates, setDates] = useState<Record<string, WindowDTO[]>>(() =>
    Object.fromEntries(initial.dates.map((d) => [d.day, d.windows])),
  );
  const [month, setMonth] = useState<Month>(() => monthOf(today, locale));
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<WindowDTO[]>([]);
  const [draftTouched, setDraftTouched] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = offerings.filter((o) => o.active);
  const [previewId, setPreviewId] = useState(active[0]?.templateId ?? '');
  const [preview, setPreview] = useState<SlotsDTO | null>(null);
  /** Bumped after each save so the preview reloads. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!previewId || version < 0) return;
    let live = true;
    apiGet<SlotsDTO>(`/api/v1/mentors/${mentorId}/slots?templateId=${previewId}`).then((r) => {
      if (live) setPreview(r.ok ? r.data : null);
    });
    return () => {
      live = false;
    };
  }, [mentorId, previewId, version]);

  const typeTitle = (id: string) => offerings.find((o) => o.templateId === id)?.title ?? '';
  const weeklyOf = (day: string): WindowDTO[] =>
    rules
      .filter((r) => r.weekday === WEEK[weekdayIndex(day)])
      .map((r) => ({ start: r.start, end: r.end, templateIds: r.templateIds }));
  const hoursOf = (day: string) => {
    const own = dates[day];
    return own ? { own: true, windows: own } : { own: false, windows: weeklyOf(day) };
  };

  function changeSelection(next: string[]) {
    if (selected.length === 0 && next.length) {
      const first = hoursOf(next[0] as string).windows;
      setDraft(first.length ? first : [DEFAULT_WINDOW]);
      setDraftTouched(false);
    }
    setSelected([...next].sort());
  }

  function toggleDay(day: string) {
    changeSelection(
      selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day],
    );
  }

  function toggleDays(days: string[]) {
    const open = days.filter((d) => d >= today);
    const all = open.length > 0 && open.every((d) => selected.includes(d));
    changeSelection(
      all ? selected.filter((d) => !open.includes(d)) : [...new Set([...selected, ...open])],
    );
  }

  /** Sets (or with `null` removes) the own hours of every selected date. */
  function setSelectedDates(windows: WindowDTO[] | null, from = dates) {
    const next = { ...from };
    for (const day of selected) {
      if (windows === null) delete next[day];
      else next[day] = windows;
    }
    setDates(next);
    setDirty(true);
    setSelected([]);
    return next;
  }

  async function saveOffering(o: OfferingDTO, patch: Partial<OfferingDTO>) {
    setSaving(o.templateId);
    setError(null);
    const body = {
      active: patch.active ?? o.active,
      bufferMinutes: patch.bufferMinutes ?? o.bufferMinutes,
      minNoticeHours: patch.minNoticeHours ?? o.minNoticeHours,
      horizonDays: patch.horizonDays ?? o.horizonDays,
      cancelNoticeHours: patch.cancelNoticeHours ?? o.cancelNoticeHours,
      location: (patch.location ?? o.location)?.trim() || null,
    };
    // Show the new state at once (the checkbox must react to the click); undone on failure.
    const replace = (next: OfferingDTO) =>
      setOfferings((list) => list.map((x) => (x.templateId === o.templateId ? next : x)));
    replace({ ...o, ...body });
    const result = await apiPut<OfferingDTO>(
      `/api/v1/mentors/${mentorId}/offerings/${o.templateId}`,
      body,
    );
    setSaving(null);
    if (!result.ok) {
      replace(o);
      setError(result.error.message);
      return;
    }
    replace(result.data);
    if (result.data.active && !previewId) setPreviewId(o.templateId);
    setVersion((v) => v + 1);
    toast.show({ message: t('calendar.toast.offeringSaved', { title: o.title }) });
    router.refresh();
  }

  async function saveHours() {
    // Edited hours of a selection not yet applied are not lost on save.
    const toSave = selected.length && draftTouched ? setSelectedDates(draft) : dates;
    setSaving('hours');
    setError(null);
    const window = (w: WindowDTO) => ({ start: w.start, end: w.end, templateIds: w.templateIds });
    const result = await apiPut<AvailabilityDTO>(`/api/v1/mentors/${mentorId}/availability`, {
      rules: rules.map((r) => ({ weekday: r.weekday, ...window(r) })),
      dates: Object.entries(toSave)
        .filter(([day]) => day >= today)
        .map(([day, windows]) => ({ day, windows: windows.map(window) })),
    });
    setSaving(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setRules(result.data.rules);
    setDates(Object.fromEntries(result.data.dates.map((d) => [d.day, d.windows])));
    setDirty(false);
    setVersion((v) => v + 1);
    toast.show({ message: t('calendar.toast.hoursSaved') });
    router.refresh();
  }

  const weeklyDays = new Set(rules.map((r) => r.weekday)).size;
  const selectedHasOwn = selected.some((d) => dates[d] !== undefined);

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert tone="error" role="alert" className="mb-0">
          {error}
        </Alert>
      ) : null}

      <Card aria-labelledby="h-offerings">
        <CardHead
          title={t('calendar.offerings')}
          titleId="h-offerings"
          icon="briefcase"
          sub={t('calendar.offeringsSub')}
        />
        {offerings.length === 0 ? (
          <p className="text-sm text-fg-3">{t('calendar.noOfferings')}</p>
        ) : (
          <ul className="-mx-4 md:-mx-5">
            {offerings.map((o) => (
              <OfferingRow
                key={o.templateId}
                offering={o}
                busy={saving === o.templateId}
                onSave={(patch) => saveOffering(o, patch)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card aria-labelledby="h-month">
        <CardHead title={t('calendar.month')} titleId="h-month" icon="calendar" className="mb-1" />
        <p className="mb-4 text-sm text-fg-3">{t('calendar.monthSub')}</p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <MonthGrid
              month={month}
              onMonth={setMonth}
              min={today}
              max={addDaysTo(today, PLAN_DAYS)}
              onWeekday={(_, days) => toggleDays(days)}
              weekdayLabel={(weekday) =>
                t('calendar.selectWeekday', { weekday: t(`weekday.${weekday}`) })
              }
              renderDay={(day) => {
                const past = day < today;
                const { own, windows } = hoursOf(day);
                const isSelected = selected.includes(day);
                const range = (w: WindowDTO) =>
                  `${shortClock(w.start, locale)}–${shortClock(w.end, locale)}`;
                const summary = windows.length
                  ? windows.map(range).join(t('calendar.sep'))
                  : t('calendar.off');
                return (
                  <button
                    type="button"
                    disabled={past}
                    aria-pressed={isSelected}
                    aria-label={`${format.fullDate(dayDate(day))}: ${summary}`}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      'flex min-h-14 w-full cursor-pointer flex-col items-stretch gap-0.5 rounded-sm border p-0.5 text-start sm:p-1 md:min-h-20 md:p-1.5',
                      own && windows.length
                        ? 'border-primary-line bg-primary-weak'
                        : own
                          ? 'border-dashed border-line-2 bg-surface-2'
                          : 'border-line bg-surface hover:border-line-strong',
                      isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-surface',
                      past && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <span
                      className={cn(
                        'text-sm tabular-nums',
                        day === today ? 'font-bold text-primary-text' : 'font-semibold',
                      )}
                    >
                      {dayNumber(day)}
                    </span>
                    {past ? null : windows.length ? (
                      <>
                        {windows.slice(0, 2).map((w, i) => (
                          // Wraps to two short lines when a narrow cell cannot hold the range.
                          <span
                            key={`${w.start}-${w.end}`}
                            className={cn(
                              'flex flex-wrap text-[10px] leading-tight tabular-nums md:text-[11px]',
                              own ? 'text-primary-text' : 'text-fg-2',
                              i === 1 && 'hidden md:flex',
                            )}
                          >
                            <span className="whitespace-nowrap">
                              {shortClock(w.start, locale)}–
                            </span>
                            <span className="whitespace-nowrap">{shortClock(w.end, locale)}</span>
                          </span>
                        ))}
                        {windows.length > 1 ? (
                          <span className="text-[11px] leading-tight text-fg-3 md:hidden">
                            {t('calendar.more', { count: windows.length - 1 })}
                          </span>
                        ) : null}
                        {windows.length > 2 ? (
                          <span className="hidden text-[11px] leading-tight text-fg-3 md:block">
                            {t('calendar.more', { count: windows.length - 2 })}
                          </span>
                        ) : null}
                      </>
                    ) : own ? (
                      <span className="text-[11px] leading-tight text-fg-3">
                        {t('calendar.off')}
                      </span>
                    ) : null}
                  </button>
                );
              }}
            />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
              <li className="flex items-center gap-1.5">
                <span className="size-3 rounded-[3px] border border-primary-line bg-primary-weak" />
                {t('calendar.legendDate')}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-3 rounded-[3px] border border-line bg-surface" />
                {t('calendar.legendWeek')}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-3 rounded-[3px] border border-dashed border-line-2 bg-surface-2" />
                {t('calendar.legendOff')}
              </li>
            </ul>
          </div>

          <section
            aria-label={t('calendar.windowsOf')}
            className="rounded-md border border-line bg-surface-2 p-3 lg:self-start"
          >
            {selected.length === 0 ? (
              <p className="text-sm text-fg-3">{t('calendar.pickHint')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold" aria-live="polite">
                    {t('calendar.selected', { count: selected.length })}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                    {t('calendar.clearSelection')}
                  </Button>
                </div>
                <p className="text-sm text-fg-2">
                  {selected
                    .slice(0, 6)
                    .map((d) => format.dayMonth(dayDate(d)))
                    .join(t('calendar.sep'))}
                  {selected.length > 6
                    ? ` ${t('calendar.more', { count: selected.length - 6 })}`
                    : ''}
                </p>
                <p className="text-sm font-semibold">{t('calendar.windowsOf')}</p>
                {draft.length === 0 ? (
                  <p className="text-sm text-fg-3">{t('calendar.noWindows')}</p>
                ) : null}
                <WindowsEditor
                  windows={draft}
                  active={active}
                  typeTitle={typeTitle}
                  onChange={(next) => {
                    setDraft(next);
                    setDraftTouched(true);
                  }}
                />
                <div className="flex flex-col gap-2">
                  <Button
                    variant="primary"
                    disabled={draft.length === 0}
                    onClick={() => setSelectedDates(draft)}
                  >
                    {t('calendar.apply')}
                  </Button>
                  <Button variant="secondary" onClick={() => setSelectedDates([])}>
                    {t('calendar.markOff')}
                  </Button>
                  {selectedHasOwn ? (
                    <Button variant="ghost" onClick={() => setSelectedDates(null)}>
                      {t('calendar.useWeekly')}
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </div>
      </Card>

      <Card aria-labelledby="h-weekly">
        <CardHead
          title={t('calendar.weekly')}
          titleId="h-weekly"
          icon="refresh"
          className="mb-1"
          actions={
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={weeklyOpen}
              aria-controls="weekly-hours"
              onClick={() => setWeeklyOpen(!weeklyOpen)}
            >
              <Icon
                name="chev-down"
                size={14}
                className={cn('transition-transform', weeklyOpen && 'rotate-180')}
              />
              {weeklyOpen ? t('calendar.hideWeekly') : t('calendar.showWeekly')}
            </Button>
          }
        />
        <p className="text-sm text-fg-3">
          {weeklyDays ? t('calendar.weeklyCount', { count: weeklyDays }) : t('calendar.weeklyNone')}
        </p>
        {weeklyOpen ? (
          <div id="weekly-hours">
            <p className="mt-2 mb-1 text-sm text-fg-3">{t('calendar.weeklySub')}</p>
            <ul className="-mx-4 md:-mx-5">
              {WEEK.map((weekday) => {
                const own = rules.filter((r) => r.weekday === weekday);
                const others = rules.filter((r) => r.weekday !== weekday);
                return (
                  <li
                    key={weekday}
                    className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0 md:flex-row md:items-start md:px-5"
                  >
                    <div className="w-24 flex-none pt-2 font-semibold">
                      {t(`weekday.${weekday}`)}
                    </div>
                    <div className="min-w-0 flex-1">
                      {own.length === 0 ? (
                        <p className="pt-2 text-sm text-fg-3">{t('calendar.closed')}</p>
                      ) : null}
                      <WindowsEditor
                        windows={own}
                        active={active}
                        typeTitle={typeTitle}
                        onChange={(next) => {
                          setRules([...others, ...next.map((w) => ({ ...w, weekday }))]);
                          setDirty(true);
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Card>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-end gap-3 md:bottom-4">
        {dirty ? (
          <span className="rounded-sm bg-surface px-2 py-1 text-sm text-fg-2 shadow-sm">
            {t('calendar.unsaved')}
          </span>
        ) : null}
        <Button variant="primary" disabled={saving === 'hours'} onClick={saveHours}>
          {t('calendar.saveHours')}
        </Button>
      </div>

      <Card aria-labelledby="h-preview">
        <CardHead title={t('calendar.preview')} titleId="h-preview" icon="eye" />
        {active.length === 0 ? (
          <p className="text-sm text-fg-3">{t('calendar.noActive')}</p>
        ) : (
          <>
            {active.length > 1 ? (
              <SelectField
                label={t('mentee.chooseType')}
                value={previewId}
                fieldClassName="md:w-80"
                onChange={(e) => setPreviewId(e.target.value)}
              >
                {active.map((o) => (
                  <option key={o.templateId} value={o.templateId}>
                    {o.title}
                  </option>
                ))}
              </SelectField>
            ) : (
              <p className="mb-3 text-sm text-fg-2">
                {t('calendar.previewOf', { title: active[0]?.title ?? '' })}
              </p>
            )}
            {preview ? <SlotCalendar key={`${previewId}-${version}`} data={preview} /> : null}
          </>
        )}
      </Card>
    </div>
  );
}

function OfferingRow({
  offering: o,
  busy,
  onSave,
}: {
  offering: OfferingDTO;
  busy: boolean;
  onSave: (patch: Partial<OfferingDTO>) => void;
}) {
  const t = useTranslations('scheduling.calendar');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    bufferMinutes: String(o.bufferMinutes),
    minNoticeHours: String(o.minNoticeHours),
    horizonDays: String(o.horizonDays),
    cancelNoticeHours: String(o.cancelNoticeHours),
    location: o.location ?? '',
  });
  const num = (key: keyof typeof form) => (
    <TextField
      label={t(
        key === 'bufferMinutes'
          ? 'buffer'
          : key === 'minNoticeHours'
            ? 'minNotice'
            : key === 'horizonDays'
              ? 'horizon'
              : 'cancelNotice',
      )}
      inputMode="numeric"
      dir="ltr"
      value={form[key]}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
    />
  );
  return (
    <li className="border-t border-line px-4 py-3 first:border-t-0 md:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <bdi className="font-semibold">{o.title}</bdi>
          <p className="text-sm text-fg-3">
            {t('minutes', { count: o.sessionMinutes })}
            {o.sessionQuota !== null ? ` · ${t('quota', { count: o.sessionQuota })}` : ''}
          </p>
        </div>
        <CheckboxField
          className="mb-0"
          label={t('accepting')}
          checked={o.active}
          disabled={busy}
          onChange={(e) => onSave({ active: e.target.checked })}
        />
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="sliders" size={14} />
          {t('settings')}
        </Button>
      </div>
      {open ? (
        <form
          className="mt-3 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              bufferMinutes: numberOrNull(form.bufferMinutes) ?? o.bufferMinutes,
              minNoticeHours: numberOrNull(form.minNoticeHours) ?? o.minNoticeHours,
              horizonDays: numberOrNull(form.horizonDays) ?? o.horizonDays,
              cancelNoticeHours: numberOrNull(form.cancelNoticeHours) ?? o.cancelNoticeHours,
              location: form.location,
            });
          }}
        >
          {num('bufferMinutes')}
          {num('minNoticeHours')}
          {num('horizonDays')}
          {num('cancelNoticeHours')}
          <TextField
            label={t('location')}
            optional
            fieldClassName="sm:col-span-2 lg:col-span-3"
            value={form.location}
            maxLength={200}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
          <div className="flex items-end pb-5">
            <Button type="submit" size="sm" variant="soft" disabled={busy}>
              {t('save')}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
