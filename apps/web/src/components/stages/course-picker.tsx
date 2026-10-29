'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useId } from 'react';
import { Icon } from '@/components/icons/icon';

/**
 * Course select of the stage board (sprint 5c): the value lives in the URL (`run`); the empty
 * value is the main path.
 */
export function CoursePicker({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
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
          router.replace(v ? `${pathname}?run=${v}` : pathname, { scroll: false });
        }}
        className="min-h-tap max-w-72 cursor-pointer appearance-none truncate rounded-sm border border-line-2 bg-surface ps-3 pe-9 text-ui font-medium text-fg shadow-xs hover:border-line-strong focus:border-focus focus:shadow-ring focus:outline-none md:min-h-10"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {`${label}: ${o.label}`}
          </option>
        ))}
      </select>
      <Icon
        name="chev-down"
        size={16}
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
      />
    </span>
  );
}
