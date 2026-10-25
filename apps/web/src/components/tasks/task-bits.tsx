import type { ReactNode } from 'react';
import { faAgo, faDayMonth, faDaysLeft, faHours, faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { Tag, TaskStatusChip } from '@/components/ui/badge';
import type { TaskStatus } from '@/modules/tasks/contracts';
import { chipStatus, STUDENT_ACTIONABLE, studentStatusLabel, taskStatusLabel } from './labels';

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
  let text = label ?? (student ? studentStatusLabel : taskStatusLabel)[status];
  if (status === 'submitted' && version && version > 1) text += ` · نسخه‌ی ${faNumber(version)}`;
  if (status === 'changes_requested' && round && round > 0) text += ` · دور ${faNumber(round)}`;
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
  const due = new Date(dueAt);
  const ext = extensions ? <Tag className="ms-1">{`${faNumber(extensions)} بار تمدید`}</Tag> : null;
  if (overdue) {
    return (
      <>
        <Tag variant="overdue">{`معوق · ${faNumber(Math.max(1, overdueDays))} روز`}</Tag>
        {ext}
      </>
    );
  }
  if (!STUDENT_ACTIONABLE.includes(status)) {
    return (
      <span className="inline-flex items-center gap-1">
        {faDayMonth(due)}
        {ext}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Icon name="calendar" size={14} className="text-fg-3" />
      {'تا '}
      <strong className="font-semibold">{faDayMonth(due)}</strong>
      <span className="text-fg-3">{`(${faDaysLeft(due, now)})`}</span>
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
  if (breached) return <Tag variant="late">{`دیر · ${faHours(elapsedHours)}`}</Tag>;
  if (warning)
    return (
      <span className="font-semibold text-h-yellow-fg">{`${faHours(slaRemainingHours)} تا موعد`}</span>
    );
  return <span>{faAgo(new Date(lastSubmittedAt), now)}</span>;
}
