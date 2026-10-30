import Link from 'next/link';
import { faAgo } from '@/components/format/fa';
import { Tag, TaskStatusChip } from '@/components/ui/badge';
import type { StudentQuestionDTO } from '@/modules/questions/contracts';

/** Student view of where a question stands (no SLA numbers, no assignee). */
export function StudentQuestionState({
  q,
  expectedResponseText,
}: {
  q: Pick<StudentQuestionDTO, 'status' | 'hasNewReply' | 'awaiting'>;
  expectedResponseText: string;
}) {
  if (q.hasNewReply) return <Tag variant="new">پاسخ جدید</Tag>;
  if (q.status === 'closed') return <TaskStatusChip status="cancelled">بسته</TaskStatusChip>;
  if (q.awaiting === 'team') {
    return (
      <>
        <TaskStatusChip status="open">منتظر پاسخ</TaskStatusChip>
        <span>{expectedResponseText}</span>
      </>
    );
  }
  return <TaskStatusChip status="accepted">پاسخ داده شد</TaskStatusChip>;
}

/** "My questions" rows (mockups/student-home.html #h-q). New replies first. */
export function StudentQuestionRows({
  items,
  expectedResponseText,
  now,
}: {
  items: StudentQuestionDTO[];
  expectedResponseText: string;
  now: Date;
}) {
  return (
    <ul className="-mx-4 md:-mx-5">
      {items.map((q) => (
        <li
          key={q.id}
          className="relative border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover md:px-5"
        >
          <Link
            href={`/my/questions/${q.id}`}
            className="block leading-6 font-semibold text-fg hover:text-link"
          >
            <bdi>{q.subject}</bdi>
          </Link>
          <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-fg-2">
            <StudentQuestionState q={q} expectedResponseText={expectedResponseText} />
            {q.task ? (
              <span>
                {'درباره‌ی '}
                <bdi className="font-medium text-fg">{q.task.title}</bdi>
              </span>
            ) : null}
            <span className="text-fg-3">
              {faAgo(new Date(q.lastMessageAt ?? q.createdAt), now)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** New replies first, then waiting ones, then the rest by latest activity. */
export function sortStudentQuestions(items: StudentQuestionDTO[]): StudentQuestionDTO[] {
  const rank = (q: StudentQuestionDTO) => (q.hasNewReply ? 0 : q.status === 'closed' ? 2 : 1);
  const at = (q: StudentQuestionDTO) => Date.parse(q.lastMessageAt ?? q.createdAt);
  return [...items].sort((a, b) => rank(a) - rank(b) || at(b) - at(a));
}
