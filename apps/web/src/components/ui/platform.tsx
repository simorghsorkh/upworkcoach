import { cn } from './cn';

/** Short mark for the platform square (mockups `.platform[data-m]`): U, F, in, Be, … */
export function platformMark(name: string): string {
  const n = name.trim().toLowerCase();
  if (n.startsWith('linkedin')) return 'in';
  if (n.startsWith('behance')) return 'Be';
  const first = Array.from(name.trim())[0] ?? '؟';
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

/** Platform badge (design-system §2-6 `.platform`): LTR-isolated name with a mark square. */
export function PlatformBadge({ name, className }: { name: string; className?: string }) {
  return (
    <bdi
      dir="ltr"
      className={cn(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-xs border border-line bg-surface py-0.5 ps-1.5 pe-2 text-xs leading-4 font-semibold text-fg-2',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-grid size-4 place-items-center rounded-[4px] bg-surface-3 text-[10px] font-extrabold"
      >
        {platformMark(name)}
      </span>
      {name}
    </bdi>
  );
}
