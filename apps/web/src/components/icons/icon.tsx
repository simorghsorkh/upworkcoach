import { cn } from '@/components/ui/cn';
import { directionalIcons, type IconName, iconPaths } from './paths';

/**
 * Stroke widths keep the rendered line at ~1.75px across sizes (design-system §5):
 * 24-unit grid → 2.1 at 20px, 2.4 at 16px, 2.5 at 14px.
 */
const STROKE: Record<IconSize, number> = {
  12: 2.6,
  14: 2.5,
  16: 2.4,
  18: 2.2,
  20: 2.1,
  22: 1.9,
  24: 1.75,
  26: 1.7,
};

export type IconSize = 12 | 14 | 16 | 18 | 20 | 22 | 24 | 26;

type IconProps = {
  name: IconName;
  size?: IconSize;
  /** Override stroke width (e.g. the active tab-bar icon is bolder). */
  strokeWidth?: number;
  className?: string;
  /** Accessible name. Omit for decorative icons (the default: aria-hidden). */
  label?: string;
};

export function Icon({ name, size = 20, strokeWidth, className, label }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? STROKE[size]}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('inline-block flex-none', directionalIcons.has(name) && 'i-dir', className)}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  );
}

export type { IconName };
