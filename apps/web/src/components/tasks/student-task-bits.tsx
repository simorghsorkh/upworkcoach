import Link from 'next/link';
import type { ReactNode } from 'react';
import { faDayMonth, faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { LtrBlock } from '@/components/ui/ltr';
import type { StudentReviewDTO, StudentTaskListItemDTO } from '@/modules/tasks/contracts';
import { DueText, TaskStatusBadge } from './task-bits';

const NEW_FEEDBACK_DAYS = 3;

/** Feedback the student has not had time to act on yet ("New feedback"). */
export function isNewFeedback(t: StudentTaskListItemDTO, now: Date): boolean {
  if (!t.latestReview) return false;
  if (t.status !== 'changes_requested' && t.status !== 'accepted') return false;
  return now.getTime() - Date.parse(t.latestReview.createdAt) < NEW_FEEDBACK_DAYS * 86_400_000;
}

/**
 * Student task row (mockups/student-home.html "My tasks"): title, status in the student's
 * words, "New feedback", the deadline (red "Overdue · N days" when late; never a health or a rule
 * code), and "See feedback" when there is something to read.
 */
export function StudentTaskItem({ task: t, now }: { task: StudentTaskListItemDTO; now: Date }) {
  const fresh = isNewFeedback(t, now);
  return (
    <li
      className={cn(
        'relative flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover max-md:flex-wrap md:px-5',
        t.overdue &&
          'before:absolute before:start-0 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px] before:bg-h-red-fg',
      )}
    >
      <div className="min-w-0 flex-1">
        <Link
          href={`/my/tasks/${t.id}`}
          className="block leading-6 font-semibold text-fg hover:text-link"
        >
          <bdi>{t.title}</bdi>
        </Link>
        <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-fg-2">
          <TaskStatusBadge status={t.status} student />
          {fresh ? <Tag variant="new">بازخورد جدید</Tag> : null}
          {t.status === 'submitted' ? (
            <span>بازبینی مشاور معمولاً تا ۴۸ ساعت</span>
          ) : (
            <DueText
              dueAt={t.dueAt}
              status={t.status}
              overdue={t.overdue}
              overdueDays={t.overdueDays}
              now={now}
            />
          )}
        </div>
      </div>
      {fresh ? (
        <Link
          href={`/my/tasks/${t.id}`}
          className={buttonClass({ size: 'sm', variant: 'primary', className: 'max-md:w-full' })}
        >
          دیدن بازخورد
        </Link>
      ) : null}
    </li>
  );
}

const SECTIONS = ['حکم', 'نقطه‌ی قوت', 'مهم‌ترین اصلاح‌ها', 'مهم‌ترین اصلاح', 'نمونه', 'قدم بعدی'];
const SECTION_RE = new RegExp(`^\\s*(${SECTIONS.join('|')})\\s*[:：]\\s*(.*)$`);

/**
 * Splits feedback written with the mentor template (mentor-workflow §6) into labelled parts;
 * free text stays as it is.
 */
export function parseFeedback(text: string): Array<{ label: string; body: string }> | null {
  const parts: Array<{ label: string; body: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = SECTION_RE.exec(line);
    if (m?.[1]) parts.push({ label: m[1], body: m[2] ?? '' });
    else if (parts.length) {
      const last = parts[parts.length - 1];
      if (last) last.body = last.body ? `${last.body}\n${line}` : line;
    } else if (line.trim()) return null;
  }
  const filled = parts.filter((p) => p.body.trim());
  return filled.length >= 2 ? filled.map((p) => ({ ...p, body: p.body.trim() })) : null;
}

/** «"…"» quoted English sentences become their own LTR block (design-system §7). */
function FeedbackText({ text }: { text: string }): ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const quote = /^\s*["“](.+)["”]\s*$/.exec(line);
    // biome-ignore lint/suspicious/noArrayIndexKey: lines of one immutable text
    if (quote) return <LtrBlock key={i} compact className="my-1">{`"${quote[1]}"`}</LtrBlock>;
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: lines of one immutable text
      <span key={i} dir="auto" className="block">
        {line || ' '}
      </span>
    );
  });
}

/** S3 "Feedback …" card (mockups/student-task.html `.feedback`). */
export function FeedbackCard({
  review,
  version,
  fresh,
  heading = 'بازخورد مشاورت',
}: {
  review: StudentReviewDTO;
  version: number;
  fresh: boolean;
  heading?: string;
}) {
  const parts = parseFeedback(review.feedbackText);
  const accepted = review.outcome === 'accepted';
  return (
    <section
      aria-labelledby="h-fb"
      className="overflow-hidden rounded-md border border-primary-line bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-primary-line bg-primary-weak px-4 py-3 md:px-5 md:py-4">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-primary-weak-2 text-primary-text"
        >
          <Icon name="chat" size={16} />
        </span>
        <h2 id="h-fb" className="min-w-0 flex-1 text-h2">
          {heading}
        </h2>
        {fresh ? <Tag variant="new">جدید</Tag> : null}
        <span className="text-xs text-fg-3">{`نسخه‌ی ${faNumber(version)} · ${faDayMonth(new Date(review.createdAt))}`}</span>
      </div>
      <div className="p-4 md:p-5">
        <p
          className={cn(
            'mb-3 inline-flex items-center gap-1.5 font-bold',
            accepted ? 'text-h-green-fg' : 'text-h-yellow-fg',
          )}
        >
          <Icon name={accepted ? 'check-circle' : 'undo'} size={18} />
          {accepted ? 'پذیرفته شد' : 'نیاز به اصلاح'}
          {review.score ? (
            <span className="font-medium text-fg-2">{` · امتیاز ${faNumber(review.score)} از ۵`}</span>
          ) : null}
        </p>
        {parts ? (
          <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-ui leading-6 md:grid-cols-[max-content_minmax(0,1fr)] md:gap-y-3">
            {parts.map((p) => (
              <div key={p.label} className="contents">
                <dt className="text-sm font-semibold text-fg-3">{p.label}</dt>
                <dd className={cn('m-0 mb-2 md:mb-0', p.label === 'قدم بعدی' && 'font-bold')}>
                  <FeedbackText text={p.body} />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="text-ui leading-6">
            <FeedbackText text={review.feedbackText} />
          </div>
        )}
      </div>
    </section>
  );
}
