'use client';

import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { Icon } from '@/components/icons/icon';
import { cn } from './cn';

/**
 * Form fields — mockups/styles.css §15 and design-system §4-1:
 * label above (14/600), 44px control, 16px text (no iOS zoom), strong border (3.6:1),
 * focus = indigo border + 3px ring, error = red border + ring + icon + text,
 * aria-invalid / aria-describedby wired automatically.
 */

const controlBase =
  'block w-full rounded-sm border bg-surface px-3 py-2 text-input text-fg ' +
  'placeholder:text-fg-3 transition-[border-color,box-shadow] duration-150 ease-out ' +
  'hover:border-fg-2 focus:outline-none focus:border-focus focus:shadow-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-65';

function controlClass(invalid: boolean, extra?: string) {
  return cn(
    controlBase,
    invalid
      ? 'border-h-red-fg shadow-ring-error hover:border-h-red-fg focus:border-h-red-fg'
      : 'border-line-strong',
    extra,
  );
}

type FieldShellProps = {
  id: string;
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  hintId: string;
  error?: string | null;
  errorId: string;
  /** Visually hide the label (it stays for screen readers). */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
};

function FieldShell({
  id,
  label,
  optional,
  hint,
  hintId,
  error,
  errorId,
  hideLabel,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('mb-5', className)}>
      <label
        htmlFor={id}
        className={cn('mb-1.5 block text-ui font-semibold text-fg', hideLabel && 'sr-only')}
      >
        {label}
        {optional ? <span className="font-normal text-fg-3"> (اختیاری)</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="mt-1.5 flex items-start gap-1.5 text-sm text-fg-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-h-red-fg"
        >
          <Icon name="alert" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function useFieldIds(explicitId?: string) {
  const auto = useId();
  const id = explicitId ?? `f${auto}`;
  return { id, hintId: `${id}-hint`, errorId: `${id}-error` };
}

function describedBy(hasHint: boolean, hintId: string, hasError: boolean, errorId: string) {
  const ids = [hasError ? errorId : null, hasHint ? hintId : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

type CommonFieldProps = {
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
  fieldClassName?: string;
};

export type TextFieldProps = CommonFieldProps &
  InputHTMLAttributes<HTMLInputElement> & {
    /** Control drawn inside the input at the end of the line (e.g. show-password toggle). */
    endAdornment?: ReactNode;
    ref?: Ref<HTMLInputElement>;
  };

export function TextField({
  label,
  optional,
  hint,
  error,
  hideLabel,
  fieldClassName,
  id: explicitId,
  className,
  endAdornment,
  ...input
}: TextFieldProps) {
  const { id, hintId, errorId } = useFieldIds(explicitId);
  return (
    <FieldShell
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      hideLabel={hideLabel}
      className={fieldClassName}
    >
      {/* Same direction as the input so the adornment sits at the input's own end. */}
      <div className="relative" dir={input.dir}>
        <input
          id={id}
          className={controlClass(
            Boolean(error),
            cn('min-h-tap', endAdornment ? 'pe-12' : null, className),
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(Boolean(hint), hintId, Boolean(error), errorId)}
          {...input}
        />
        {endAdornment ? (
          <div className="absolute inset-y-0 end-0 flex items-center pe-1">{endAdornment}</div>
        ) : null}
      </div>
    </FieldShell>
  );
}

export type TextareaFieldProps = CommonFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextareaField({
  label,
  optional,
  hint,
  error,
  hideLabel,
  fieldClassName,
  id: explicitId,
  className,
  ...textarea
}: TextareaFieldProps) {
  const { id, hintId, errorId } = useFieldIds(explicitId);
  return (
    <FieldShell
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      hideLabel={hideLabel}
      className={fieldClassName}
    >
      <textarea
        id={id}
        dir={textarea.dir ?? 'auto'}
        className={controlClass(Boolean(error), cn('min-h-30 resize-y', className))}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(Boolean(hint), hintId, Boolean(error), errorId)}
        {...textarea}
      />
    </FieldShell>
  );
}

export type SelectFieldProps = CommonFieldProps &
  SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode };

export function SelectField({
  label,
  optional,
  hint,
  error,
  hideLabel,
  fieldClassName,
  id: explicitId,
  className,
  children,
  ...select
}: SelectFieldProps) {
  const { id, hintId, errorId } = useFieldIds(explicitId);
  return (
    <FieldShell
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      hideLabel={hideLabel}
      className={fieldClassName}
    >
      <div className="relative">
        <select
          id={id}
          className={controlClass(
            Boolean(error),
            cn('min-h-tap cursor-pointer appearance-none pe-9', className),
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(Boolean(hint), hintId, Boolean(error), errorId)}
          {...select}
        >
          {children}
        </select>
        {/* Drawn chevron at the end of the line (left in RTL); logical, so no LTR exception needed. */}
        <Icon
          name="chev-down"
          size={16}
          className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
        />
      </div>
    </FieldShell>
  );
}
