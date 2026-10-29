import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useFormat } from '@/components/format/use-format';
import { Icon } from '@/components/icons/icon';
import { Tag, TaskStatusChip } from '@/components/ui/badge';
import type { TaskStatus } from '@/modules/tasks/contracts';
import { chipStatus, STUDENT_ACTIONABLE } from './labels';
import { useTaskLabels } from './use-task-labels';

/** Status chip (icon + text) with the round/version suffix the mockups use. */
export function TaskStatusBadge({
  status,
  version,
  round,
  student,
  suffix,
  label,
}: {
  status: TaskStatus;
  /** «منتظر بازبینی · نسخه‌ی ۴» */
  version?: number;
  /** «نیاز به اصلاح · دور ۳» */
  round?: number;
  /** Student wording («تحویل دادی»). */
  student?: boolean;
  suffix?: string;
  /** Replaces the status word, e.g. «منتظر بازبینی شما». */
  label?: string;
}) {
  const t = useTranslations('tasks');
  const labels = useTaskLabels();
  let text = label ?? (student ? labels.studentStatus : labels.status)[status];
  if (status === 'submitted' && version && version > 1)
    text += ` · ${t('version', { n: version })}`;
  if (status === 'changes_requested' && round && round > 0)
    text += ` · ${t('round', { n: round })}`;
  if (suffix) text += ` · ${suffix}`;
  return <TaskStatusChip status={chipStatus[status]}>{text}</TaskStatusChip>;
}

/**
 * Deadline: red «معوق · ۹ روز» tag when overdue (F4: a label, not a status), otherwise
 * «تا ۳۰ مهر (۳ روز مانده)». Final tasks only show the date.
 */
export function DueText({
  dueAt,
  status,
  overdue,
  overdueDays,
  now,
  extensions,
}: {
  dueAt: string;
  status: TaskStatus;
  overdue: boolean;
  overdueDays: number;
  now: Date;
  extensions?: number;
}): ReactNode {
  const t = useTranslations('tasks');
  const format = useFormat();
  const due = new Date(dueAt);
  const ext = extensions ? (
    <Tag className="ms-1">{t('extensions', { count: extensions })}</Tag>
  ) : null;
  if (overdue) {
    return (
      <>
        <Tag variant="overdue">{t('overdue', { count: Math.max(1, overdueDays) })}</Tag>
        {ext}
      </>
    );
  }
  if (!STUDENT_ACTIONABLE.includes(status)) {
    return (
      <span className="inline-flex items-center gap-1">
        {format.dayMonth(due)}
        {ext}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Icon name="calendar" size={14} className="text-fg-3" />
      {`${t('until')} `}
      <strong className="font-semibold">{format.dayMonth(due)}</strong>
      <span className="text-fg-3">{`(${format.daysLeft(due, now)})`}</span>
      {ext}
    </span>
  );
}

/** Review SLA: «دیر · ۵۲ ساعت» once breached, «۶ ساعت تا موعد» when close, else the age. */
export function SlaText({
  breached,
  warning,
  elapsedHours,
  slaRemainingHours,
  lastSubmittedAt,
  now,
}: {
  breached: boolean;
  warning: boolean;
  elapsedHours: number;
  slaRemainingHours: number;
  lastSubmittedAt: string;
  now: Date;
}) {
  const t = useTranslations('tasks');
  const format = useFormat();
  if (breached) return <Tag variant="late">{t('late', { hours: format.hours(elapsedHours) })}</Tag>;
  if (warning)
    return (
      <span className="font-semibold text-h-yellow-fg">
        {t('dueIn', { hours: format.hours(slaRemainingHours) })}
      </span>
    );
  return <span>{format.ago(new Date(lastSubmittedAt), now)}</span>;
}
