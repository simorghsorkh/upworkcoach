import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Buttons — mockups/styles.css §5 (.btn, .btn-primary, .btn-soft, …).
 * One `primary` per page; repeated row actions use `soft`.
 */
export type ButtonVariant =
  | 'secondary'
  | 'primary'
  | 'soft'
  | 'ghost'
  | 'link'
  | 'danger'
  | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg';

type StyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
};

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border font-semibold no-underline cursor-pointer ' +
  'transition-[background-color,border-color,box-shadow,color] duration-150 ease-out active:translate-y-px ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-55 aria-disabled:active:translate-y-0 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0';

const variants: Record<ButtonVariant, string> = {
  secondary:
    'bg-surface text-fg border-line-2 shadow-xs hover:bg-surface-2 hover:border-line-strong [&_svg]:text-fg-2',
  primary:
    'bg-primary text-on-brand border-primary shadow-primary hover:bg-primary-hover hover:border-primary-hover',
  soft: 'bg-primary-weak text-primary-text border-primary-line hover:bg-primary-weak-2 hover:border-brand-300',
  ghost:
    'bg-transparent text-fg-2 border-transparent hover:bg-surface-2 hover:text-fg [&_svg]:text-fg-2',
  link: 'bg-transparent text-link border-transparent px-2 hover:bg-primary-weak',
  danger:
    'bg-surface text-h-red-fg border-h-red-bd shadow-xs hover:bg-h-red-bg hover:border-h-red-fg',
  'danger-solid':
    'bg-h-solid text-white border-h-solid hover:bg-h-solid-hover hover:border-h-solid-hover',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 md:min-h-8 px-3 text-sm gap-1.5 rounded-btn-sm',
  md: 'min-h-tap md:min-h-btn px-4 text-ui rounded-sm',
  lg: 'min-h-12 px-6 text-md rounded-md',
};

export function buttonClass({
  variant = 'secondary',
  size = 'md',
  block,
  className,
}: StyleOptions = {}) {
  return cn(base, variants[variant], sizes[size], block && 'w-full', className);
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-3.5 flex-none animate-spin rounded-full border-2 border-current border-e-transparent"
    />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  StyleOptions & {
    /** Shows a spinner, keeps the label (e.g. «در حال ثبت…») and blocks clicks. */
    loading?: boolean;
    children: ReactNode;
  };

export function Button({
  variant,
  size,
  block,
  loading,
  className,
  type = 'button',
  disabled,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  // aria-disabled (not `disabled`) while loading keeps focus on the button.
  const inert = Boolean(disabled || loading);
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, className })}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (inert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & StyleOptions;

export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size, block, className })} {...rest} />;
}
