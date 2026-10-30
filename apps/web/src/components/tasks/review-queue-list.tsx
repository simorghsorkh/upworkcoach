import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import type { ReviewQueueItemDTO } from '@/modules/tasks/contracts';
import { SlaText, TaskStatusBadge } from './task-bits';

/** Late and urgent first, then the oldest (user-flows §6, bullet D). */
export function sortQueue(items: ReviewQueueItemDTO[]): ReviewQueueItemDTO[] {
  const rank = (i: ReviewQueueItemDTO) =>
    i.breached ? 0 : i.priority === 'urgent' ? 1 : i.warning ? 2 : 3;
  return [...items].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(a.lastSubmittedAt) - Date.parse(b.lastSubmittedAt),
  );
}

/** "Submissions awaiting review" rows (mockups/today.html #reviews). */
export function ReviewQueueList({
  items,
  viewerId,
  showReviewer,
  now,
}: {
  items: ReviewQueueItemDTO[];
  viewerId: string;
  showReviewer?: boolean;
  now: Date;
}) {
  const t = useTranslations('tasks');
  return (
    <ul className="-mx-4 md:-mx-5">
      {sortQueue(items).map((r) => (
        <li
          key={r.taskId}
          className={cn(
            'relative flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover md:px-5',
            r.breached &&
              'before:absolute before:start-0 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px] before:bg-h-red-fg',
            !r.breached &&
              r.warning &&
              'before:absolute before:start-0 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px] before:bg-h-yellow-bd',
          )}
        >
          <Avatar id={r.student.id} name={r.student.displayName} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <Link
              href={`/tasks/${r.taskId}`}
              className="block leading-6 font-semibold text-fg hover:text-link"
            >
              <bdi>{r.title}</bdi>
            </Link>
            <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-fg-2">
              <span className="font-semibold text-fg">{r.student.displayName}</span>
              <SlaText
                breached={r.breached}
                warning={r.warning}
                elapsedHours={r.elapsedHours}
                slaRemainingHours={r.slaRemainingHours}
                lastSubmittedAt={r.lastSubmittedAt}
                now={now}
              />
              {r.priority === 'urgent' ? <Tag variant="urgent">{t('urgent')}</Tag> : null}
              {r.version > 1 ? <TaskStatusBadge status="submitted" version={r.version} /> : null}
              {r.program && !r.program.isLegacy ? (
                <Tag variant="outline" icon="flag">
                  <bdi>{r.program.title}</bdi>
                </Tag>
              ) : null}
              {r.requiredForGate ? (
                <Tag variant="gate">
                  {r.stage ? t('gateStage', { stage: r.stage.displayCode }) : t('gate')}
                </Tag>
              ) : null}
              {showReviewer ? (
                <span>
                  {t('reviewer', {
                    name: r.reviewer.id === viewerId ? t('me') : r.reviewer.displayName,
                  })}
                </span>
              ) : null}
            </div>
          </div>
          <Link
            href={`/tasks/${r.taskId}`}
            className={buttonClass({ size: 'sm', variant: 'soft', className: 'flex-none' })}
            aria-label={t('reviewAria', { title: r.title, student: r.student.displayName })}
          >
            {t('review')}
          </Link>
        </li>
      ))}
    </ul>
  );
}
