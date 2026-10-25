import Link from 'next/link';
import { faAgo, faHours, faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import type { StaffQuestionListItemDTO } from '@/modules/questions/contracts';
import { questionStatusLabel } from './labels';

/**
 * SLA of a thread while the ball is with the team (api.md section 10): breached = red «دیر»,
 * warning = «N ساعت تا موعد» in amber, otherwise how long it has waited.
 */
export function QuestionSla({
  q,
  now,
}: {
  q: Pick<StaffQuestionListItemDTO, 'sla' | 'awaitingTeamSince' | 'createdAt' | 'status'>;
  now: Date;
}) {
  if (!q.sla) {
    return <span className="text-fg-3">{questionStatusLabel[q.status]}</span>;
  }
  if (q.sla.breached) return <Tag variant="late">{`دیر · ${faHours(q.sla.elapsedHours)}`}</Tag>;
  if (q.sla.warning) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-h-yellow-fg">
        <Icon name="clock" size={14} />
        {`${faHours(q.sla.remainingHours)} تا موعد`}
      </span>
    );
  }
  return (
    <span>
      {`${faAgo(new Date(q.awaitingTeamSince ?? q.createdAt), now)} · ${faHours(q.sla.remainingHours)} تا موعد`}
    </span>
  );
}

/** «از check-in: …» for threads opened by the weekly check-in. */
export function QuestionSubject({
  q,
}: {
  q: Pick<StaffQuestionListItemDTO, 'subject' | 'source'>;
}) {
  return (
    <>
      {q.source === 'checkin' ? (
        <span className="text-fg-2">
          از <bdi>check-in</bdi>:{' '}
        </span>
      ) : null}
      <bdi>{q.subject}</bdi>
    </>
  );
}

/**
 * Staff question rows (mockups/today.html #questions; the M7 queue uses the same rows):
 * breached first is the caller's order; a red bar marks breached, amber marks warning.
 */
export function QuestionRows({
  items,
  now,
  viewerId,
  showAssignee,
  showStudent = true,
}: {
  items: StaffQuestionListItemDTO[];
  now: Date;
  viewerId: string;
  showAssignee?: boolean;
  showStudent?: boolean;
}) {
  return (
    <ul className="-mx-4 md:-mx-5">
      {items.map((q) => {
        const late = q.sla?.breached;
        const warn = !late && q.sla?.warning;
        const waiting = q.awaiting === 'team' && q.status !== 'closed';
        return (
          <li
            key={q.id}
            className={cn(
              'relative flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover md:px-5',
              (late || warn) &&
                'before:absolute before:start-0 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px]',
              late && 'before:bg-h-red-fg',
              warn && 'before:bg-h-yellow-bd',
            )}
          >
            {showStudent ? (
              <Avatar id={q.student.id} name={q.student.displayName} className="mt-0.5" />
            ) : null}
            <div className="min-w-0 flex-1">
              <Link
                href={`/questions/${q.id}`}
                className="block leading-6 font-semibold text-fg hover:text-link"
              >
                <QuestionSubject q={q} />
              </Link>
              <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-fg-2">
                {showStudent ? (
                  <span className="font-semibold text-fg">{q.student.displayName}</span>
                ) : null}
                {q.priority === 'urgent' ? <Tag variant="urgent">فوری</Tag> : null}
                <QuestionSla q={q} now={now} />
                {q.task ? (
                  <span className="min-w-0">
                    {'درباره‌ی '}
                    <bdi className="font-medium text-fg">{q.task.title}</bdi>
                  </span>
                ) : null}
                {q.messageCount > 1 ? <span>{`${faNumber(q.messageCount)} پیام`}</span> : null}
                {q.viaAssignment ? <Tag variant="outline">واگذارشده به تو</Tag> : null}
                {showAssignee ? (
                  <span>{`پاسخ‌گو: ${q.assignee.id === viewerId ? 'خودم' : q.assignee.displayName}`}</span>
                ) : null}
              </div>
            </div>
            <Link
              href={`/questions/${q.id}`}
              className={buttonClass({
                size: 'sm',
                variant: waiting ? 'soft' : 'ghost',
                className: 'flex-none',
              })}
              aria-label={`${waiting ? 'پاسخ به' : 'دیدن'} سؤال ${q.subject} از ${q.student.displayName}`}
            >
              {waiting ? 'پاسخ' : 'دیدن'}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
