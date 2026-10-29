'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { useFormat } from '@/components/format/use-format';
import { Icon } from '@/components/icons/icon';
import { cn } from '@/components/ui/cn';

type Opt = { id: string; label: string };

const select =
  'min-h-tap w-full cursor-pointer appearance-none rounded-sm border border-line-2 bg-surface ps-3 pe-9 text-ui font-medium text-fg shadow-xs hover:border-line-strong focus:border-focus focus:shadow-ring focus:outline-none md:min-h-10 md:w-auto';

/**
 * M5 toolbar (mockups/tasks.html `.toolbar`): search (title or student, 400 ms debounce), type,
 * mentor (admin) and stage. Every value lives in the URL so the list is shareable and works
 * after a reload. On the review tab (sprint 5) also the program run and the SLA state.
 */
export function TaskFilters({
  types,
  mentors,
  stages,
  runs,
}: {
  types: Opt[];
  mentors: Opt[] | null;
  stages: Opt[];
  /** Review tab only: program runs to narrow the queue to (also turns on the SLA filter). */
  runs?: Opt[] | null;
}) {
  const tf = useTranslations('taskFilters');
  const format = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: only the typed text triggers
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    const t = setTimeout(() => set('q', q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const active = ['type', 'mentor', 'stage', 'run', 'sla'].filter((k) => params.get(k)).length;

  const selects = (
    <>
      <span className="relative inline-flex max-md:w-full">
        <label htmlFor={`${id}-type`} className="sr-only">
          {tf('type')}
        </label>
        <select
          id={`${id}-type`}
          className={select}
          value={params.get('type') ?? ''}
          onChange={(e) => set('type', e.target.value)}
        >
          <option value="">{tf('allTypes')}</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <Icon
          name="chev-down"
          size={16}
          className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
        />
      </span>
      {mentors ? (
        <span className="relative inline-flex max-md:w-full">
          <label htmlFor={`${id}-mentor`} className="sr-only">
            {tf('mentor')}
          </label>
          <select
            id={`${id}-mentor`}
            className={select}
            value={params.get('mentor') ?? ''}
            onChange={(e) => set('mentor', e.target.value)}
          >
            <option value="">{tf('mentorAll')}</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {tf('mentorIs', { name: m.label })}
              </option>
            ))}
          </select>
          <Icon
            name="chev-down"
            size={16}
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
          />
        </span>
      ) : null}
      <span className="relative inline-flex max-md:w-full">
        <label htmlFor={`${id}-stage`} className="sr-only">
          {tf('stage')}
        </label>
        <select
          id={`${id}-stage`}
          className={select}
          value={params.get('stage') ?? ''}
          onChange={(e) => set('stage', e.target.value)}
        >
          <option value="">{tf('allStages')}</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <Icon
          name="chev-down"
          size={16}
          className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
        />
      </span>
      {runs ? (
        <>
          <span className="relative inline-flex max-md:w-full">
            <label htmlFor={`${id}-run`} className="sr-only">
              {tf('run')}
            </label>
            <select
              id={`${id}-run`}
              className={select}
              value={params.get('run') ?? ''}
              onChange={(e) => set('run', e.target.value)}
            >
              <option value="">{tf('allRuns')}</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <Icon
              name="chev-down"
              size={16}
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
            />
          </span>
          <span className="relative inline-flex max-md:w-full">
            <label htmlFor={`${id}-sla`} className="sr-only">
              {tf('sla')}
            </label>
            <select
              id={`${id}-sla`}
              className={select}
              value={params.get('sla') ?? ''}
              onChange={(e) => set('sla', e.target.value)}
            >
              <option value="">{tf('slaAll')}</option>
              <option value="breached">{tf('slaBreached')}</option>
              <option value="warning">{tf('slaWarning')}</option>
              <option value="ok">{tf('slaOk')}</option>
            </select>
            <Icon
              name="chev-down"
              size={16}
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
            />
          </span>
        </>
      ) : null}
    </>
  );

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-[360px]">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-3"
          />
          <input
            type="search"
            aria-label={tf('search')}
            placeholder={tf('searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="block min-h-tap w-full rounded-sm border border-line-strong bg-surface ps-10 pe-3 text-input text-fg placeholder:text-fg-3 hover:border-fg-2 focus:border-focus focus:shadow-ring focus:outline-none md:min-h-10 md:text-ui"
          />
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-tap cursor-pointer items-center gap-1.5 rounded-sm border border-line-2 bg-surface px-3 text-ui font-semibold md:hidden"
        >
          <Icon name="filter" size={16} />
          {tf('filter')}
          {active ? (
            <span className="rounded-full bg-primary px-1.5 text-2xs text-on-brand">
              {format.number(active)}
            </span>
          ) : null}
        </button>
        <div
          className={cn(
            'gap-2 md:flex md:basis-auto md:flex-row md:flex-wrap',
            open ? 'flex basis-full flex-col' : 'hidden',
          )}
        >
          {selects}
        </div>
      </div>
    </div>
  );
}
