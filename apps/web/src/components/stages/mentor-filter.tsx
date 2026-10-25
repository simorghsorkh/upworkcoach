'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useId } from 'react';
import { Icon } from '@/components/icons/icon';

/** «مشاور: همه» select of the kanban (admin only); the value lives in the URL. */
export function MentorFilter({
  value,
  mentors,
  param = 'mentorId',
  allowNone = true,
  keep = {},
  label = 'مشاور',
}: {
  value: string;
  mentors: Array<{ id: string; label: string }>;
  /** Query-string key (default `mentorId`). */
  param?: string;
  /** Offer «بدون مشاور» (students without a mentor). */
  allowNone?: boolean;
  /** Other query-string values to keep (e.g. the current tab). */
  keep?: Record<string, string>;
  /** Prefix of the options and the accessible name, e.g. «پاسخ‌گو». */
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  return (
    <span className="relative inline-flex">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        key={value}
        defaultValue={value}
        onChange={(e) => {
          const v = e.target.value;
          const params = new URLSearchParams(keep);
          if (v) params.set(param, v);
          const q = params.toString();
          router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
        }}
        className="min-h-tap cursor-pointer appearance-none rounded-sm border border-line-2 bg-surface ps-3 pe-9 text-ui font-medium text-fg shadow-xs hover:border-line-strong focus:border-focus focus:shadow-ring focus:outline-none md:min-h-10"
      >
        <option value="">{`${label}: همه`}</option>
        {mentors.map((m) => (
          <option key={m.id} value={m.id}>
            {`${label}: ${m.label}`}
          </option>
        ))}
        {allowNone ? <option value="none">بدون مشاور</option> : null}
      </select>
      <Icon
        name="chev-down"
        size={16}
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
      />
    </span>
  );
}
