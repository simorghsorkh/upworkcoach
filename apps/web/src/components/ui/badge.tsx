import type { ReactNode } from 'react';
import { faNumber } from '@/components/format/fa';
import { Icon, type IconName } from '@/components/icons/icon';
import { cn } from './cn';

/* ---------------------------------------------------------------------------
   Count — pill 20px, 12/700, tabular digits, always a full aria-label.
   --------------------------------------------------------------------------- */
export type CountTone = 'neutral' | 'brand' | 'alert' | 'side';

const countTones: Record<CountTone, string> = {
  neutral: 'bg-surface-3 text-fg-2',
  brand: 'bg-primary text-white',
  alert: 'bg-h-solid text-white',
  /** On the dark ink sidebar. */
  side: 'bg-side-count text-side-strong',
};

export function Count({
  value,
  label,
  tone = 'neutral',
  small,
  className,
}: {
  value: number;
  /** 18px variant (tabs, bottom bar, student top bar). */
  small?: boolean;
  /** Full phrase for screen readers, e.g. "3 unanswered questions". Defaults to the number. */
  label?: string;
  tone?: CountTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full leading-none font-bold tabular-nums',
        small ? 'h-[18px] min-w-[18px] px-[5px] text-2xs' : 'h-5 min-w-5 px-1.5 text-xs',
        countTones[tone],
        className,
      )}
    >
      <span aria-hidden="true">{faNumber(value)}</span>
      <span className="sr-only">{label ?? faNumber(value)}</span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Tag — design-system §2-6.
   --------------------------------------------------------------------------- */
export type TagVariant = 'neutral' | 'overdue' | 'late' | 'urgent' | 'new' | 'gate' | 'outline';

const tagVariants: Record<TagVariant, string> = {
  neutral: 'bg-surface-2 text-fg-2 font-medium',
  overdue: 'bg-h-solid text-white font-bold',
  late: 'bg-surface text-h-red-fg font-bold ring-1 ring-inset ring-h-red-bd',
  urgent: 'bg-fg text-surface font-bold',
  new: 'bg-primary text-white font-bold',
  gate: 'bg-primary-weak text-primary-text font-medium ring-1 ring-inset ring-primary-line',
  outline: 'bg-transparent text-fg-2 font-medium ring-1 ring-inset ring-line-2',
};

const tagIcons: Partial<Record<TagVariant, IconName>> = { late: 'clock', urgent: 'zap' };

export function Tag({
  variant = 'neutral',
  icon,
  className,
  children,
}: {
  variant?: TagVariant;
  /** Defaults: clock for `late`, lightning for `urgent`. Pass `null` for none. */
  icon?: IconName | null;
  className?: string;
  children: ReactNode;
}) {
  const iconName = icon === undefined ? tagIcons[variant] : icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-xs leading-4',
        tagVariants[variant],
        className,
      )}
    >
      {iconName ? <Icon name={iconName} size={14} /> : null}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Task status chip — design-system §2-5 (icon + text, never colour alone).
   --------------------------------------------------------------------------- */
export type TaskStatus =
  | 'open'
  | 'in_progress'
  | 'submitted'
  | 'changes'
  | 'accepted'
  | 'cancelled';

const taskStatus: Record<TaskStatus, { className: string; icon: IconName | null; label: string }> =
  {
    open: { className: 'bg-st-open-bg text-st-open-fg', icon: 'st-open', label: 'باز' },
    in_progress: {
      className: 'bg-st-progress-bg text-st-progress-fg',
      icon: 'st-progress',
      label: 'در حال انجام',
    },
    submitted: {
      className: 'bg-st-submitted-bg text-st-submitted-fg',
      icon: 'hourglass',
      label: 'منتظر بازبینی',
    },
    changes: { className: 'bg-h-yellow-bg text-h-yellow-fg', icon: 'undo', label: 'نیاز به اصلاح' },
    accepted: { className: 'bg-h-green-bg text-h-green-fg', icon: 'check', label: 'پذیرفته' },
    cancelled: { className: 'bg-surface-2 text-fg-3 line-through', icon: null, label: 'لغوشده' },
  };

export function TaskStatusChip({
  status,
  children,
  className,
}: {
  status: TaskStatus;
  /** Override the default label (e.g. "Needs changes · round 2", "Submitted"). */
  children?: ReactNode;
  className?: string;
}) {
  const s = taskStatus[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-xs px-2 py-[3px] text-xs leading-4 font-semibold',
        s.className,
        className,
      )}
    >
      {s.icon ? <Icon name={s.icon} size={14} /> : null}
      {children ?? s.label}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Health badge — design-system §2-4: colour + SHAPE + text. Staff only;
   students never see it.
   --------------------------------------------------------------------------- */
export type Health = 'green' | 'yellow' | 'red' | 'churn' | 'paused';

const healthStyles: Record<Health, { pill: string; label: string }> = {
  green: { pill: 'bg-h-green-bg text-h-green-fg border-h-green-bd', label: 'روبه‌راه' },
  yellow: { pill: 'bg-h-yellow-bg text-h-yellow-fg border-h-yellow-bd', label: 'نیاز به توجه' },
  red: { pill: 'bg-h-red-bg text-h-red-fg border-h-red-bd', label: 'گیرکرده' },
  churn: { pill: 'bg-h-solid text-white border-h-solid', label: 'گیرکرده · خطر ریزش' },
  paused: { pill: 'bg-h-paused-bg text-h-paused-fg border-h-paused-bd', label: 'متوقف' },
};

/** The shape alone (decorative; the text next to it carries the meaning). */
export function HealthShape({ health }: { health: Health }) {
  switch (health) {
    case 'green':
      return <span aria-hidden="true" className="size-2 flex-none rounded-full bg-current" />;
    case 'yellow':
      return (
        <span
          aria-hidden="true"
          className="h-[9px] w-2.5 flex-none bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]"
        />
      );
    case 'red':
    case 'churn':
      return <span aria-hidden="true" className="size-2 flex-none rounded-[1px] bg-current" />;
    case 'paused':
      return (
        <span
          aria-hidden="true"
          className="h-2 w-2 flex-none border-x-[2.5px] border-current bg-transparent"
        />
      );
  }
}

export function HealthBadge({
  health,
  muted,
  dot,
  children,
  className,
}: {
  health: Health;
  /** Alert snoozed ("Alert muted until …"): dashed outline, transparent fill. */
  muted?: boolean;
  /** Shape + text without the pill (summary rows). */
  dot?: boolean;
  /** Override text, e.g. "Paused until 6 Aban". */
  children?: ReactNode;
  className?: string;
}) {
  const s = healthStyles[health];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-xs leading-4 font-bold',
        dot ? 'text-fg' : cn('rounded-full border py-[3px] ps-2.5 pe-[9px]', s.pill),
        muted && !dot && 'border-dashed bg-transparent',
        className,
      )}
    >
      <span className={cn('inline-flex', dot && healthDotColor[health])}>
        <HealthShape health={health} />
      </span>
      {children ?? s.label}
    </span>
  );
}

const healthDotColor: Record<Health, string> = {
  green: 'text-h-green-fg',
  yellow: 'text-h-yellow-fg',
  red: 'text-h-red-fg',
  churn: 'text-h-solid',
  paused: 'text-h-paused-fg',
};

/** "Ball in the … court" — who should act next. */
export function Ball({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line-2 px-2 py-[3px] text-xs leading-4 font-medium text-fg-2">
      <Icon name="ball" size={14} className="text-fg-3" />
      {children}
    </span>
  );
}

/** Rule code (R-OVERDUE): small, Latin, isolated. */
export function RuleCode({ children }: { children: ReactNode }) {
  return (
    <bdi
      dir="ltr"
      className="whitespace-nowrap rounded-[4px] bg-surface-2 px-1.5 py-px text-xs leading-4 font-medium text-fg-3"
    >
      {children}
    </bdi>
  );
}
