import { faNumber } from '@/components/format/fa';
import { cn } from './cn';

/** Stages 0..8 of the default learning path (docs/02-product/learning/learning-path.md). */
export const STAGE_COUNT = 9;

/**
 * Path bar (design-system §4 `.path`): past = light indigo, current = indigo, wider, taller
 * and ringed; future = empty. Shape and size, not only colour, mark the current stage;
 * always paired with the stage name. The number of segments follows the admin's path
 * (settings can add or deactivate stages), 9 by default.
 */
export function PathBar({
  current,
  total = STAGE_COUNT,
  large,
  className,
}: {
  /** Position of the current stage in the path, 0-based. */
  current: number;
  /** Number of stages in the path. */
  total?: number;
  /** Full-width variant (profile header, student home). */
  large?: boolean;
  className?: string;
}) {
  const count = Math.max(1, Math.trunc(total));
  const stage = Math.min(Math.max(Math.trunc(current), 0), count - 1);
  return (
    <span
      role="img"
      aria-label={`مرحله‌ی ${faNumber(stage)} از مسیر ${faNumber(0)} تا ${faNumber(count - 1)}`}
      className={cn(
        'items-center align-middle',
        large ? 'flex w-full gap-1' : 'inline-flex gap-[3px]',
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => {
        const state = i < stage ? 'done' : i === stage ? 'current' : 'future';
        return (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed segments, never reordered
            key={i}
            className={cn(
              'block rounded-[3px]',
              large ? 'flex-1' : 'w-3',
              state === 'current'
                ? cn('bg-primary shadow-ring', large ? 'h-2.5 flex-[1.6]' : 'h-2 w-5')
                : cn(large ? 'h-2' : 'h-1.5', state === 'done' ? 'bg-brand-300' : 'bg-surface-3'),
            )}
          />
        );
      })}
    </span>
  );
}
