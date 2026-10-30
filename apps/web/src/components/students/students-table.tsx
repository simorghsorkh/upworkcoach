import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  faDayMonth,
  faDays,
  faNumber,
  faRelativeDay,
  tehranDaysBetween,
} from '@/components/format/fa';
import { Avatar } from '@/components/ui/avatar';
import { HealthBadge, Tag } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { PathBar } from '@/components/ui/path-bar';
import { PlatformBadge } from '@/components/ui/platform';
import type { OverExpected, StudentListItemDTO } from '@/modules/students/contracts';
import { CoursePhases } from './course-phases';
import { HealthCell } from './health';
import { lifecycleLabel } from './labels';

export type StudentRow = StudentListItemDTO & {
  /** Position of the stage in the path (0-based) and the number of stages. */
  stageIndex: number;
  stageTotal: number;
  /** A submission of this student waits for review (default sort and "Submission waiting"). */
  waitingReview?: boolean;
};

/* Responsive table (mockups §11 `.rtable`): a table from 768px, a card per row below it. */
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

function overClass(over: OverExpected) {
  return over === 'over'
    ? 'font-bold text-h-red-fg'
    : over === 'warn'
      ? 'font-bold text-h-yellow-fg'
      : '';
}

export function StudentsTable({
  rows,
  viewerId,
  showMentor,
  caption,
}: {
  rows: StudentRow[];
  viewerId: string;
  showMentor: boolean;
  caption: string;
}) {
  const now = new Date();
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface shadow-sm max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
      <table className="w-full border-collapse text-ui leading-[22px] max-md:block">
        <caption className="sr-only">{caption}</caption>
        <thead className="max-md:hidden">
          <tr>
            <th scope="col" className={th}>
              هنرجو
            </th>
            <th scope="col" className={th}>
              وضعیت و دلیل
            </th>
            <th scope="col" className={th}>
              مرحله
            </th>
            <th scope="col" className={th}>
              کار بعدی
            </th>
            <th scope="col" className={cn(th, 'max-lg:hidden')}>
              آخرین فعالیت
            </th>
            {showMentor ? (
              <th scope="col" className={th}>
                مشاور
              </th>
            ) : null}
            <th scope="col" className={cn(th, 'max-lg:hidden')}>
              ویترین
            </th>
          </tr>
        </thead>
        <tbody className="max-md:block">
          {rows.map((s) => (
            <tr
              key={s.id}
              className="transition-colors duration-150 hover:bg-hover max-md:relative max-md:mb-3 max-md:block max-md:rounded-md max-md:border max-md:border-line max-md:bg-surface max-md:p-4 max-md:shadow-sm max-md:hover:bg-surface [&:last-child>td]:border-b-0"
            >
              <td className="border-b border-line px-4 py-3 align-middle max-md:mb-2 max-md:block max-md:border-b max-md:px-0 max-md:pt-0 max-md:pb-3">
                <div className="flex items-center gap-3">
                  <Avatar id={s.id} name={s.displayName} />
                  <div className="min-w-0">
                    <Link
                      href={`/students/${s.id}`}
                      className="text-md font-bold text-fg hover:text-link"
                    >
                      {s.displayName}
                    </Link>
                    {s.tags.length || s.accountStatus === 'invited' ? (
                      <div className="mt-[3px] flex flex-wrap items-center gap-1.5">
                        {s.accountStatus === 'invited' ? (
                          <Tag variant="outline">هنوز وارد نشده</Tag>
                        ) : null}
                        {s.tags.map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </td>
              <Cell label="وضعیت">
                <LifecycleCell student={s} />
              </Cell>
              <Cell label="مرحله">
                <div className="flex flex-col gap-1.5 max-md:items-end">
                  <PathBar current={s.stageIndex} total={s.stageTotal} />
                  <span className="text-sm text-fg-2">
                    <span className="text-ui font-semibold text-fg">
                      {`${s.stage.displayCode} ${s.stage.name}`}
                    </span>
                    {' · '}
                    {s.lifecycleStatus === 'paused' ? (
                      <span className="text-fg-3">—</span>
                    ) : (
                      <span className={overClass(s.overExpected)}>{faDays(s.daysInStage)}</span>
                    )}
                  </span>
                  <CoursePhases courses={s.courses} className="max-md:items-end" />
                </div>
              </Cell>
              <Cell label="کار بعدی">
                {s.nextTask ? (
                  <div className="flex flex-col items-start gap-1 max-md:items-end">
                    <Link href={`/tasks/${s.nextTask.id}`} className="text-fg hover:text-link">
                      <bdi>{s.nextTask.title}</bdi>
                    </Link>
                    {s.nextTask.overdue ? (
                      <Tag variant="overdue">{`معوق · ${faNumber(Math.max(1, tehranDaysBetween(new Date(s.nextTask.dueAt), now)))} روز`}</Tag>
                    ) : (
                      <span className="text-xs text-fg-3">{`تا ${faDayMonth(new Date(s.nextTask.dueAt))}`}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-fg-3">کار بازی ندارد</span>
                )}
              </Cell>
              <Cell label="آخرین فعالیت" className="max-lg:hidden!">
                {s.lastActivityAt ? (
                  faRelativeDay(new Date(s.lastActivityAt), now)
                ) : (
                  <span className="text-fg-3">—</span>
                )}
              </Cell>
              {showMentor ? (
                <Cell label="مشاور">
                  {s.mentor ? (
                    <span className="inline-flex items-center gap-2">
                      <Avatar id={s.mentor.id} name={s.mentor.displayName} size="xs" />
                      {s.mentor.id === viewerId ? 'خودم' : s.mentor.displayName}
                    </span>
                  ) : (
                    <span className="text-fg-3">بدون مشاور</span>
                  )}
                </Cell>
              ) : null}
              <Cell label="ویترین" className="max-lg:hidden!">
                {s.primaryProfile ? (
                  <PlatformBadge name={s.primaryProfile.platformName} />
                ) : (
                  <span className="text-fg-3">—</span>
                )}
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Health badge + plain reason (PRD F7: the reason is always next to the status) and "Submission
 * waiting" when a submission waits for review. Before the first computation (`null`) or for
 * graduated / dropped students (`untracked`) the lifecycle is shown instead.
 */
function LifecycleCell({ student }: { student: StudentRow }) {
  const waiting = student.waitingReview ? (
    <Tag variant="neutral" icon="hourglass">
      تحویل منتظر
    </Tag>
  ) : null;
  if (student.health && student.health.status !== 'untracked') {
    return <HealthCell health={student.health} extra={waiting} />;
  }
  switch (student.lifecycleStatus) {
    case 'paused':
      return <HealthBadge health="paused">{lifecycleLabel.paused}</HealthBadge>;
    case 'active':
      return <span className="text-sm text-fg-3">{lifecycleLabel.active}</span>;
    default:
      return <Tag variant="outline">{lifecycleLabel[student.lifecycleStatus]}</Tag>;
  }
}
