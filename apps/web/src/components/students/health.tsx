import type { ReactNode } from 'react';
import { faDayMonth, faNumber, tehranDaysBetween } from '@/components/format/fa';
import { ballLabel, healthKind, reasonText, ruleAdvice } from '@/components/health/reasons';
import { Icon } from '@/components/icons/icon';
import { HealthBadge, RuleCode } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import type { HealthBall } from '@/modules/health/contracts';
import type { HealthSummaryDTO } from '@/modules/students/contracts';

/**
 * Staff-only health UI (design-system §2-4: colour + SHAPE + text; PRD F7 "the reason is always next to
 * the status"). Students never see any of it: no `(student)` page imports this file.
 * `untracked` (graduated / dropped) renders nothing.
 */
export function HealthPill({
  health,
  pausedUntil,
}: {
  health: HealthSummaryDTO;
  /** `YYYY-MM-DD` return day of a paused student, for "Paused until 6 Aban". */
  pausedUntil?: string | null;
}) {
  const kind = healthKind(health.status, health.churnRisk);
  if (!kind) return null;
  if (health.snoozedUntil && kind !== 'paused') {
    return (
      <HealthBadge health={kind} muted>
        <span className="sr-only">{statusWord(kind)}، </span>
        {`هشدار خاموش تا ${faDayMonth(new Date(health.snoozedUntil))}`}
      </HealthBadge>
    );
  }
  if (kind === 'paused' && pausedUntil) {
    return (
      <HealthBadge health="paused">
        {`متوقف تا ${faDayMonth(new Date(`${pausedUntil}T12:00:00Z`))}`}
      </HealthBadge>
    );
  }
  return <HealthBadge health={kind} />;
}

function statusWord(kind: ReturnType<typeof healthKind>): string {
  switch (kind) {
    case 'red':
      return 'گیرکرده';
    case 'churn':
      return 'گیرکرده، خطر ریزش';
    case 'yellow':
      return 'نیاز به توجه';
    case 'green':
      return 'روبه‌راه';
    default:
      return 'متوقف';
  }
}

/** "Ball: student" (mockups `.ball`). */
export function BallChip({ ball }: { ball: HealthBall }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line-2 px-2 py-[3px] text-xs leading-4 font-medium text-fg-2"
      title={`توپ در زمین ${ballLabel[ball]}`}
    >
      <Icon name="ball" size={14} className="text-fg-3" />
      <span aria-hidden="true">{`توپ: ${ballLabel[ball]}`}</span>
      <span className="sr-only">{`توپ در زمین ${ballLabel[ball]}`}</span>
    </span>
  );
}

/**
 * The reasons as one line with the small rule codes at the end (mockups `.reason` + `.rule`):
 * "2 overdue tasks (max: 9 days) · 9 days inactive  R-OVERDUE, R-INACT".
 */
export function HealthReasonLine({
  health,
  className,
}: {
  health: HealthSummaryDTO;
  className?: string;
}) {
  if (!health.reasons.length || health.status === 'green' || health.status === 'untracked') {
    return null;
  }
  return (
    <p className={cn('text-sm leading-5 text-fg-2', className)}>
      <span className="sr-only">دلیل: </span>
      {health.reasons.map((r) => reasonText(r)).join(' · ')}{' '}
      <RuleCode>{health.reasons.map((r) => r.rule).join(', ')}</RuleCode>
    </p>
  );
}

/** Badge + reason line (students table "Status and reason", kanban card). */
export function HealthCell({ health, extra }: { health: HealthSummaryDTO; extra?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 max-md:items-end">
      <span className="flex flex-wrap items-center gap-1.5 max-md:justify-end">
        <HealthPill health={health} />
        {extra}
      </span>
      <HealthReasonLine health={health} className="max-md:text-end" />
    </div>
  );
}

/**
 * Record header (mockups/student-profile.html `.reasons`): one chip per active rule with its
 * plain text and code, yellow ones lighter; then the first suggested action.
 */
export function HealthReasonList({ health, now }: { health: HealthSummaryDTO; now: Date }) {
  if (health.status === 'untracked' || health.status === 'paused') return null;
  if (!health.reasons.length) {
    return (
      <p className="mt-2 text-sm text-fg-3">
        {`بدون نشانه‌ی گیر کردن · از ${faRelativeSince(health.statusSince, now)}`}
      </p>
    );
  }
  const advice = health.reasons.map((r) => ruleAdvice[r.rule]).find(Boolean);
  return (
    <>
      <ul aria-label="دلیل وضعیت" className="mt-2 flex flex-wrap gap-2">
        {health.reasons.map((r) => (
          <li
            key={r.rule}
            className={cn(
              'inline-flex flex-wrap items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm leading-5 font-medium',
              r.level === 'red' ? 'bg-h-red-bg text-h-red-fg' : 'bg-h-yellow-bg text-h-yellow-fg',
            )}
          >
            <span>{reasonText(r)}</span>
            <RuleCode>{r.rule}</RuleCode>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
        <span>{`${statusSinceText(health)} ${faRelativeSince(health.statusSince, now)}`}</span>
        {advice ? (
          <span className="inline-flex items-center gap-1 text-fg-2">
            <Icon name="phone" size={14} className="text-fg-3" />
            {`پیشنهاد: ${advice}`}
          </span>
        ) : null}
      </p>
    </>
  );
}

function statusSinceText(health: HealthSummaryDTO): string {
  if (health.status === 'red') return 'قرمز از';
  if (health.status === 'yellow') return 'زرد از';
  return 'در این وضعیت از';
}

function faRelativeSince(iso: string, now: Date): string {
  const days = tehranDaysBetween(new Date(iso), now);
  if (days <= 0) return 'امروز';
  if (days === 1) return 'دیروز';
  return `${faNumber(days)} روز پیش`;
}
