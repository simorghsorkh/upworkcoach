import { Icon, type IconName } from '@/components/icons/icon';
import { cn } from '@/components/ui/cn';
import { getFormat } from '@/i18n/server-format';

export const kpiTones = {
  sky: 'bg-st-progress-bg text-st-progress-fg',
  brand: 'bg-primary-weak-2 text-primary-text',
  plum: 'bg-av-2-bg text-av-2-fg',
  red: 'bg-h-red-bg text-h-red-fg',
  yellow: 'bg-h-yellow-bg text-h-yellow-fg',
  green: 'bg-h-green-bg text-h-green-fg',
} as const;

/**
 * A number tile that jumps somewhere (an anchor or a page): "Today" and the organization
 * dashboard (sprint 6). `sub` is a small red pill next to the number.
 */
export async function Kpi({
  href,
  icon,
  tone,
  value,
  label,
  sub,
}: {
  href: string;
  icon: IconName;
  tone: keyof typeof kpiTones;
  value: number;
  label: string;
  sub: string | null;
}) {
  const format = await getFormat();
  return (
    <a
      href={href}
      className="grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-lg border border-line bg-surface p-3 text-fg shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary-line hover:shadow-md md:gap-x-4 md:p-5"
    >
      <span
        aria-hidden="true"
        className={cn(
          'row-span-2 grid size-9 place-items-center rounded-[10px] md:size-11 md:rounded-xl',
          kpiTones[tone],
        )}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="flex items-baseline gap-2 text-kpi-mob font-extrabold tabular-nums md:text-kpi">
        {format.number(value)}
        {sub ? (
          <span className="self-center rounded-full bg-h-red-bg px-1.5 py-[3px] text-2xs leading-none font-bold text-h-red-fg md:px-2 md:text-xs">
            {sub}
          </span>
        ) : null}
      </span>
      <span className="text-xs font-medium text-fg-2 md:text-ui">{label}</span>
    </a>
  );
}

/** "Past response time" (mockups `.priority`): breached waiting items, oldest first. */
