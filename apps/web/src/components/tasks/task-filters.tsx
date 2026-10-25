'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { cn } from '@/components/ui/cn';

type Opt = { id: string; label: string };

const select =
  'min-h-tap w-full cursor-pointer appearance-none rounded-sm border border-line-2 bg-surface ps-3 pe-9 text-ui font-medium text-fg shadow-xs hover:border-line-strong focus:border-focus focus:shadow-ring focus:outline-none md:min-h-10 md:w-auto';

/**
 * M5 toolbar (mockups/tasks.html `.toolbar`): search (title or student, 400 ms debounce), type,
 * mentor (admin) and stage. Every value lives in the URL so the list is shareable and works
 * after a reload.
 */
export function TaskFilters({
  types,
  mentors,
  stages,
}: {
  types: Opt[];
  mentors: Opt[] | null;
  stages: Opt[];
}) {
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

  const active = ['type', 'mentor', 'stage'].filter((k) => params.get(k)).length;

  const selects = (
    <>
      <span className="relative inline-flex max-md:w-full">
        <label htmlFor={`${id}-type`} className="sr-only">
          نوع
        </label>
        <select
          id={`${id}-type`}
          className={select}
          value={params.get('type') ?? ''}
          onChange={(e) => set('type', e.target.value)}
        >
          <option value="">همه‌ی انواع</option>
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
            مشاور
          </label>
          <select
            id={`${id}-mentor`}
            className={select}
            value={params.get('mentor') ?? ''}
            onChange={(e) => set('mentor', e.target.value)}
          >
            <option value="">مشاور: همه</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {`مشاور: ${m.label}`}
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
          مرحله
        </label>
        <select
          id={`${id}-stage`}
          className={select}
          value={params.get('stage') ?? ''}
          onChange={(e) => set('stage', e.target.value)}
        >
          <option value="">همه‌ی مراحل</option>
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
            aria-label="جستجو"
            placeholder="جستجوی عنوان کار یا نام هنرجو…"
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
          فیلتر
          {active ? (
            <span className="rounded-full bg-primary px-1.5 text-2xs text-on-brand">
              {faNumber(active)}
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
