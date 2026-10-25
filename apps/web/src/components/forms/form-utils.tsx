'use client';

import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import type { ApiError } from '@/components/api/client';
import { toLatinDigits } from '@/components/format/fa';
import { cn } from '@/components/ui/cn';

/** Same rule as the server (SEC-X2): https only, no credentials, a host. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const HTTPS_MESSAGE = 'آدرس کامل را با https بنویس.';

/** «۲۵٫۵» / «25.50» → «25.5»; null when it is not a non-negative amount with ≤ 2 decimals. */
export function cleanDecimal(value: string): string | null {
  const text = toLatinDigits(value.trim()).replace('٫', '.').replace(',', '.');
  return /^\d{1,10}(\.\d{1,2})?$/.test(text) ? text : null;
}

/** «React، طراحی UI, کوهورت پاییز» → ['React', 'طراحی UI', 'کوهورت پاییز'] */
export function splitTags(value: string): string[] {
  return value
    .split(/[,،\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Splits an API error into per-field messages (422) and one form-level message.
 * `rename` maps API field names to form field names when they differ.
 */
export function splitApiError<F extends string>(
  error: ApiError,
  known: readonly F[],
  rename: Partial<Record<string, F>> = {},
): { fields: Partial<Record<F, string>>; form: string | null } {
  const fields: Partial<Record<F, string>> = {};
  for (const [key, message] of Object.entries(error.fields)) {
    const name = (rename[key] ?? key) as F;
    if (known.includes(name)) fields[name] = message;
  }
  const hasField = Object.keys(fields).length > 0;
  return { fields, form: hasField ? null : error.message };
}

/** Checkbox with its label to the start (design-system §4-1 `.check`). */
export function CheckboxField({
  label,
  hint,
  className,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={cn('mb-5', className)}>
      <label htmlFor={id} className="flex min-h-tap cursor-pointer items-center gap-2.5 text-ui">
        <input
          id={id}
          type="checkbox"
          className="size-[18px] flex-none cursor-pointer accent-primary"
          aria-describedby={hint ? `${id}-hint` : undefined}
          {...input}
        />
        <span className="font-medium">{label}</span>
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="ms-7 text-sm text-fg-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Copies text; falls back to a hidden textarea where the async clipboard is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
