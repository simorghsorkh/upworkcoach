import Link from 'next/link';
import type { ReactNode } from 'react';
import { faAgo } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import type { SubmissionType } from '@/modules/catalog/contracts';
import type { TaskPriority, TaskStatus } from '@/modules/tasks/contracts';
import { submissionTypeIcon, submissionTypeLabel } from './labels';
import { DueText, SlaText, TaskStatusBadge } from './task-bits';

export type TaskRow = {
  id: string;
  title: string;
  student: { id: string; displayName: string };
  status: TaskStatus;
  submissionType: SubmissionType | null;
  priority: TaskPriority;
  requiredForGate: boolean;
  dueAt: string | null;
  overdue: boolean;
  overdueDays: number;
  extensionCount: number;
  revisionCount: number;
  version: number | null;
  lastSubmittedAt: string | null;
  sla: {
    breached: boolean;
    warning: boolean;
    elapsedHours: number;
    slaRemainingHours: number;
  } | null;
};

const td =
  'border-b border-line px-4 py-3 align-middle text-start max-md:flex max-md:items-start max-md:justify-between max-md:gap-3 max-md:border-0 max-md:px-0 max-md:py-[5px] max-md:text-end max-md:before:flex-none max-md:before:pt-0.5 max-md:before:text-start max-md:before:text-xs max-md:before:text-fg-3 max-md:before:content-[attr(data-label)] [&>*]:min-w-0';
const th = 'whitespace-nowrap bg-surface-2 px-4 py-2.5 text-start text-xs font-semibold text-fg-3';

function Cell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <td data-label={label} className={cn(td, className)}>
      {children}
    </td>
  );
}

/**
 * M5 task table (mockups/tasks.html `.rtable`): a table from 768px, one card per task below.
 * Late reviews and overdue tasks carry a red start line.
 */
export function TasksTable({
  rows,
  caption,
  now,
}: {
  rows: TaskRow[];
  caption: string;
  now: Date;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface shadow-sm max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
      <table className="w-full border-collapse text-ui leading-[22px] max-md:block">
        <caption className="sr-only">{caption}</caption>
        <thead className="max-md:hidden">
          <tr>
            <th scope="col" className={th}>
              کار
            </th>
            <th scope="col" className={th}>
              هنرجو
            </th>
            <th scope="col" className={th}>
              وضعیت
            </th>
            <th scope="col" className={th}>
              تحویل
            </th>
            <th scope="col" className={cn(th, 'max-lg:hidden')}>
              نوع
            </th>
            <th scope="col" className={th}>
              مهلت
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">اقدام</span>
            </th>
          </tr>
        </thead>
        <tbody className="max-md:block">
          {rows.map((t) => {
            const red = Boolean(t.sla?.breached || t.overdue);
            return (
              <tr
                key={t.id}
                className={cn(
                  'relative transition-colors duration-150 hover:bg-hover max-md:mb-3 max-md:block max-md:rounded-md max-md:border max-md:border-line max-md:bg-surface max-md:p-4 max-md:shadow-sm max-md:hover:bg-surface [&:last-child>td]:border-b-0',
                  red &&
                    'md:[&>td:first-child]:shadow-[inset_-3px_0_0_var(--h-red-fg)] max-md:before:absolute max-md:before:start-0 max-md:before:top-3 max-md:before:bottom-3 max-md:before:w-[3px] max-md:before:rounded-[3px] max-md:before:bg-h-red-fg',
                )}
              >
                <td className="border-b border-line px-4 py-3 align-middle max-md:mb-2 max-md:block max-md:border-b max-md:px-0 max-md:pt-0 max-md:pb-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/tasks/${t.id}`} className="font-bold text-fg hover:text-link">
                      <bdi>{t.title}</bdi>
                    </Link>
                    {t.priority === 'urgent' ? <Tag variant="urgent">فوری</Tag> : null}
                    {t.requiredForGate ? <Tag variant="gate">اجباری برای عبور</Tag> : null}
                  </div>
                </td>
                <Cell label="هنرجو" className="md:whitespace-nowrap">
                  <Link
                    href={`/students/${t.student.id}`}
                    className="inline-flex items-center gap-2 font-medium text-fg hover:text-link"
                  >
                    <Avatar id={t.student.id} name={t.student.displayName} size="sm" />
                    {t.student.displayName}
                  </Link>
                </Cell>
                <Cell label="وضعیت">
                  <TaskStatusBadge
                    status={t.status}
                    version={t.version ?? undefined}
                    round={t.status === 'changes_requested' ? t.revisionCount : undefined}
                  />
                </Cell>
                <Cell label="تحویل" className="md:whitespace-nowrap">
                  {t.sla && t.lastSubmittedAt ? (
                    <SlaText {...t.sla} lastSubmittedAt={t.lastSubmittedAt} now={now} />
                  ) : t.lastSubmittedAt ? (
                    faAgo(new Date(t.lastSubmittedAt), now)
                  ) : (
                    <span className="text-fg-3">هنوز نه</span>
                  )}
                </Cell>
                <Cell label="نوع" className="max-lg:hidden md:whitespace-nowrap">
                  {t.submissionType ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Icon
                        name={submissionTypeIcon[t.submissionType]}
                        size={16}
                        className="text-fg-3"
                      />
                      {submissionTypeLabel[t.submissionType]}
                    </span>
                  ) : (
                    '—'
                  )}
                </Cell>
                <Cell label="مهلت" className="md:whitespace-nowrap">
                  {t.dueAt ? (
                    <DueText
                      dueAt={t.dueAt}
                      status={t.status}
                      overdue={t.overdue}
                      overdueDays={t.overdueDays}
                      now={now}
                      extensions={t.extensionCount}
                    />
                  ) : (
                    '—'
                  )}
                </Cell>
                <td className="border-b border-line px-4 py-3 text-end align-middle max-md:block max-md:border-0 max-md:px-0 max-md:pt-3 max-md:pb-0 max-md:text-start">
                  {t.status === 'submitted' ? (
                    <Link
                      href={`/tasks/${t.id}`}
                      className={buttonClass({ size: 'sm', variant: 'soft' })}
                    >
                      بازبینی
                    </Link>
                  ) : t.overdue ? (
                    <span className="inline-flex flex-wrap gap-1.5">
                      <Link
                        href={`/tasks/${t.id}?do=extend`}
                        className={buttonClass({ size: 'sm' })}
                      >
                        <Icon name="calendar" size={14} />
                        تمدید مهلت
                      </Link>
                      <Link
                        href={`/students/${t.student.id}?add=reminder`}
                        className={buttonClass({ size: 'sm', variant: 'ghost' })}
                      >
                        یادآور
                      </Link>
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
