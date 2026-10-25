import { cn } from '@/components/ui/cn';

/**
 * Brand mark (design-system §5): rounded indigo square with steps rising
 * right-to-left to a flag — the step-by-step path to the first contract.
 */
export function BrandMark({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid flex-none place-items-center bg-linear-160 from-brand-400 to-brand-600 text-white',
        'shadow-brand',
        size === 'md' ? 'size-9 rounded-[10px]' : 'size-8 rounded-[9px]',
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={size === 'md' ? 'size-[22px]' : 'size-[19px]'}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 18.5h-4.5V14H10V9.5H5.5" />
        <path d="M5.5 9.5v-5l4 2-4 2" />
      </svg>
    </span>
  );
}
