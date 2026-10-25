'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { Count } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/field';

export type FilterValues = {
  q: string;
  stageId: string;
  mentorId: string;
  platformId: string;
  tag: string;
  lifecycle: string;
  /** Health chip (red, yellow, green, paused); rendered by the server as links. */
  health: string;
  sort: string;
};

export type FilterOptions = {
  stages: Array<{ id: string; label: string }>;
  /** null for mentors: they only see their own students (no mentor filter). */
  mentors: Array<{ id: string; label: string }> | null;
  platforms: Array<{ id: string; label: string }>;
  tags: string[];
  lifecycles: Array<{ value: string; label: string }>;
  healths: Array<{ value: string; label: string }>;
  sorts: Array<{ value: string; label: string }>;
};

const SELECT_KEYS = ['stageId', 'mentorId', 'platformId', 'tag'] as const;

/** Builds `/students?…` without empty values (clean, shareable URLs). */
function toQuery(values: Partial<FilterValues>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    const v = (value ?? '').trim();
    if (v) params.set(key, v);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function readForm(form: HTMLFormElement): Partial<FilterValues> {
  const data = new FormData(form);
  const out: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out as Partial<FilterValues>;
}

const toolbarSelect =
  'min-h-10 cursor-pointer appearance-none rounded-sm border border-line-2 bg-surface ps-3 pe-9 text-ui font-medium text-fg shadow-xs hover:border-line-strong focus:border-focus focus:shadow-ring focus:outline-none';

function ToolbarSelect({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className="relative inline-flex">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        // Remount when the URL value changes (back/forward), without touching the search box.
        key={value}
        id={id}
        name={name}
        defaultValue={value}
        className={toolbarSelect}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {children}
      </select>
      <Icon
        name="chev-down"
        size={16}
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
      />
    </span>
  );
}

/**
 * M2 toolbar (mockups/students.html): search + selects on desktop, search + «فیلتر» sheet on
 * mobile. Everything lives in the URL, so the server renders the filtered list and links can
 * be shared. Works as a plain GET form without JavaScript.
 */
export function StudentFilters({
  values,
  options,
  children,
}: {
  values: FilterValues;
  options: FilterOptions;
  /** Lifecycle chips rendered by the server, shown next to the search box on desktop. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [q, setQ] = useState(values.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => setQ(values.q), [values.q]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const go = (next: Partial<FilterValues>) => {
    router.replace(`${pathname}${toQuery(next)}`, { scroll: false });
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    go({ ...values, ...readForm(event.currentTarget) });
  }

  const activeCount =
    SELECT_KEYS.filter((k) => values[k]).length +
    (values.lifecycle ? 1 : 0) +
    (values.health ? 1 : 0);

  return (
    <>
      <form
        ref={formRef}
        action={pathname}
        method="get"
        aria-label="جستجو و فیلتر هنرجوها"
        onSubmit={onSubmit}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-[1_1_0] md:flex-[1_1_280px]">
            <Icon
              name="search"
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-3"
            />
            <label htmlFor="students-q" className="sr-only">
              جستجو
            </label>
            <input
              id="students-q"
              name="q"
              type="search"
              value={q}
              onChange={(e) => {
                const value = e.target.value;
                setQ(value);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => formRef.current?.requestSubmit(), 400);
              }}
              placeholder="جستجوی نام، موبایل یا برچسب…"
              className="min-h-tap w-full rounded-sm border border-line-2 bg-surface ps-10 pe-3 text-input text-fg shadow-xs placeholder:text-fg-3 hover:border-line-strong focus:border-focus focus:shadow-ring focus:outline-none md:min-h-10 md:text-ui"
            />
          </div>
          <button
            type="button"
            className={cn(buttonClass(), 'md:hidden')}
            aria-haspopup="dialog"
            onClick={() => setSheetOpen(true)}
          >
            <Icon name="filter" size={16} />
            فیلتر
            {activeCount ? (
              <Count
                value={activeCount}
                tone="brand"
                label={`${faNumber(activeCount)} فیلتر فعال`}
              />
            ) : null}
          </button>
          {children ? (
            <div className="hidden flex-wrap items-center gap-2 md:flex">{children}</div>
          ) : null}
        </div>

        <div className="mb-4 hidden flex-wrap items-center gap-2 md:flex">
          <ToolbarSelect label="مرحله" name="stageId" value={values.stageId}>
            <option value="">همه‌ی مراحل</option>
            {options.stages.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </ToolbarSelect>
          {options.mentors ? (
            <ToolbarSelect label="مشاور" name="mentorId" value={values.mentorId}>
              <option value="">همه‌ی مشاورها</option>
              {options.mentors.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
              <option value="none">بدون مشاور</option>
            </ToolbarSelect>
          ) : null}
          <ToolbarSelect label="پلتفرم" name="platformId" value={values.platformId}>
            <option value="">همه‌ی پلتفرم‌ها</option>
            {options.platforms.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </ToolbarSelect>
          <ToolbarSelect label="برچسب" name="tag" value={values.tag}>
            <option value="">همه‌ی برچسب‌ها</option>
            {options.tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </ToolbarSelect>
          <ToolbarSelect label="وضعیت" name="lifecycle" value={values.lifecycle}>
            {options.lifecycles.map((o) => (
              <option key={o.value} value={o.value}>
                {`وضعیت: ${o.label}`}
              </option>
            ))}
          </ToolbarSelect>
          <span className="flex-1" />
          <ToolbarSelect label="مرتب‌سازی" name="sort" value={values.sort}>
            {options.sorts.map((o) => (
              <option key={o.value} value={o.value}>
                {`مرتب‌سازی: ${o.label}`}
              </option>
            ))}
          </ToolbarSelect>
          {values.health ? <input type="hidden" name="health" value={values.health} /> : null}
          <noscript>
            <button type="submit" className={buttonClass({ size: 'sm' })}>
              اعمال
            </button>
          </noscript>
        </div>
      </form>

      <Dialog open={sheetOpen} onClose={() => setSheetOpen(false)} title="فیلتر">
        <MobileFilterForm
          values={{ ...values, q }}
          options={options}
          onApply={(next) => {
            setSheetOpen(false);
            go(next);
          }}
          onClear={() => {
            setSheetOpen(false);
            go({ q, sort: values.sort });
          }}
        />
      </Dialog>
    </>
  );
}

function MobileFilterForm({
  values,
  options,
  onApply,
  onClear,
}: {
  values: FilterValues;
  options: FilterOptions;
  onApply: (next: Partial<FilterValues>) => void;
  onClear: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply({ q: values.q, ...readForm(event.currentTarget) });
      }}
    >
      <SelectField label="سلامت" name="health" defaultValue={values.health}>
        <option value="">همه</option>
        {options.healths.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <SelectField label="وضعیت" name="lifecycle" defaultValue={values.lifecycle}>
        {options.lifecycles.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <SelectField label="مرحله" name="stageId" defaultValue={values.stageId}>
        <option value="">همه</option>
        {options.stages.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </SelectField>
      {options.mentors ? (
        <SelectField label="مشاور" name="mentorId" defaultValue={values.mentorId}>
          <option value="">همه</option>
          {options.mentors.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          <option value="none">بدون مشاور</option>
        </SelectField>
      ) : null}
      <SelectField label="پلتفرم" name="platformId" defaultValue={values.platformId}>
        <option value="">همه</option>
        {options.platforms.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <SelectField label="برچسب" name="tag" defaultValue={values.tag}>
        <option value="">همه</option>
        {options.tags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </SelectField>
      <SelectField label="مرتب‌سازی" name="sort" defaultValue={values.sort}>
        {options.sorts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <DialogActions>
        <Button onClick={onClear}>پاک کردن</Button>
        <Button type="submit" variant="primary">
          نمایش
        </Button>
      </DialogActions>
    </form>
  );
}
