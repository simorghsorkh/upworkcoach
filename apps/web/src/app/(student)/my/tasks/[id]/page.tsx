import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { faDayMonth, faDaysLeft, faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { FeedbackCard, isNewFeedback } from '@/components/tasks/student-task-bits';
import { SubmissionContent } from '@/components/tasks/submission-content';
import { StartTaskButton, SubmitForm } from '@/components/tasks/submit-form';
import { TaskStatusBadge } from '@/components/tasks/task-bits';
import { Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { Alert } from '@/components/ui/states';
import { listPlatforms } from '@/modules/catalog/service';
import type { StudentTaskDTO } from '@/modules/tasks/contracts';
import { getOwnTask } from '@/modules/tasks/service';
import { ApiError } from '@/server/http/errors';
import { NoRecord } from '../../../_components';
import { loadOwn } from '../../../_load';

type Params = Promise<{ id: string }>;

export const metadata: Metadata = { title: 'این کار' };

const ACCEPT_MARK = 'وقتی قبول است که:';

/** S3 — task, feedback and submission (mockups/student-task.html). */
export default async function MyTaskPage({ params }: { params: Params }) {
  const { id } = await params;
  const { actor, student } = await loadOwn();
  if (!student) return <NoRecord />;
  let task: StudentTaskDTO;
  try {
    task = await getOwnTask(actor, id);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403 || err.status === 422))
      notFound();
    throw err;
  }
  const platforms = await listPlatforms(actor);
  const now = new Date();
  const latest = task.submissions[0] ?? null;
  const reviewed = task.submissions.find((s) => s.review);
  const canSubmit =
    task.status === 'open' || task.status === 'in_progress' || task.status === 'changes_requested';
  const nextVersion = (latest?.version ?? 0) + 1;
  const fresh = isNewFeedback(task, now);
  const cardShown = Boolean(
    reviewed?.review && (task.status === 'changes_requested' || task.status === 'accepted'),
  );
  const older = task.submissions;
  const desc = task.description ?? '';
  const at = desc.indexOf(ACCEPT_MARK);
  const main = (at === -1 ? desc : desc.slice(0, at)).trim();
  const criterion = at === -1 ? '' : desc.slice(at + ACCEPT_MARK.length).trim();
  const mentorName = student.mentor?.displayName ?? null;

  return (
    <>
      <nav aria-label="مسیر" className="mb-3 hidden items-center gap-1.5 text-sm text-fg-3 md:flex">
        <Link href="/my/tasks" className="font-medium text-fg-2 hover:text-link">
          کارهای من
        </Link>
        <Icon name="chev-next" size={14} />
        <span aria-current="page" className="font-semibold text-fg">
          این کار
        </span>
      </nav>
      <h1 className="text-[22px] leading-8 md:text-2xl">
        <bdi>{task.title}</bdi>
      </h1>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fg-2">
        <TaskStatusBadge
          status={task.status}
          student
          round={
            task.status === 'changes_requested'
              ? task.submissions.filter((s) => s.review?.outcome === 'changes_requested').length
              : undefined
          }
        />
        {task.overdue ? (
          <Tag variant="overdue">{`عقب‌افتاده · ${faNumber(task.overdueDays)} روز`}</Tag>
        ) : canSubmit ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" size={14} className="text-fg-3" />
            تا <strong className="font-semibold text-fg">{faDayMonth(new Date(task.dueAt))}</strong>
            <span className="text-fg-3">{`(${faDaysLeft(new Date(task.dueAt), now)})`}</span>
          </span>
        ) : null}
        {mentorName ? <span>{`از طرف ${mentorName}`}</span> : null}
        {task.status === 'open' ? <StartTaskButton taskId={task.id} /> : null}
      </div>

      <div className="flex flex-col gap-4 md:gap-5">
        {cardShown && reviewed?.review ? (
          <FeedbackCard
            review={reviewed.review}
            version={reviewed.version}
            fresh={fresh}
            heading={
              reviewed.review.reviewer?.displayName
                ? `بازخورد ${reviewed.review.reviewer.displayName}`
                : undefined
            }
          />
        ) : null}

        <Card aria-labelledby="h-d">
          <CardHead title="چه کاری باید بکنی" titleId="h-d" icon="target" />
          {main ? (
            <p dir="auto" className="text-ui leading-6 whitespace-pre-line">
              {main}
            </p>
          ) : !criterion ? (
            <p className="text-sm text-fg-3">مشاورت شرحی ننوشته؛ اگر سؤالی داری بپرس.</p>
          ) : null}
          {criterion ? (
            <Alert tone="neutral" icon="target" title={ACCEPT_MARK} className="mt-3 mb-0">
              <span dir="auto" className="whitespace-pre-line">
                {criterion}
              </span>
            </Alert>
          ) : null}
        </Card>

        {/* slot: ai-check (1.0) — none in 0.1. */}
        {canSubmit ? (
          <Card>
            <SubmitForm
              taskId={task.id}
              type={task.submissionType}
              nextVersion={nextVersion}
              previous={task.status === 'changes_requested' ? latest : null}
              platforms={platforms.map((p) => ({ id: p.id, name: p.name }))}
              mentorName={mentorName}
            />
          </Card>
        ) : task.status === 'submitted' ? (
          <Alert tone="ok" role="status" title="تحویل دادی.">
            {` ${mentorName ?? 'مشاورت'} معمولاً تا ۴۸ ساعت نگاه می‌کند؛ وقتی بازخورد آمد، روی «کارها» نشان می‌بینی.`}
          </Alert>
        ) : null}

        {older.length ? (
          <Card aria-labelledby="h-ver">
            <details className="group" open={!canSubmit && task.status !== 'accepted'}>
              <summary
                id="h-ver"
                className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-ui font-semibold text-fg-2 hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
              >
                {canSubmit ? 'نسخه‌های قبلی و بازخوردها' : 'تحویل‌های تو'}
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-3 px-[5px] text-2xs font-bold">
                  {faNumber(older.length)}
                </span>
                <Icon
                  name="chev-down"
                  size={16}
                  className="transition-transform group-open:rotate-180"
                />
              </summary>
              <ol className="mt-3 flex flex-col gap-4">
                {older.map((s) => (
                  <li key={s.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                    <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                      <span className="grid size-7 place-items-center rounded-sm bg-surface-2 font-bold text-fg-2">
                        {faNumber(s.version)}
                      </span>
                      <span>{faDayMonth(new Date(s.createdAt))}</span>
                      <span className="ms-auto">
                        {s.review ? (
                          <TaskStatusBadge
                            status={
                              s.review.outcome === 'accepted' ? 'accepted' : 'changes_requested'
                            }
                          />
                        ) : (
                          <TaskStatusBadge status="submitted" student />
                        )}
                      </span>
                    </div>
                    <SubmissionContent submission={s} />
                    {s.review && !(cardShown && s.id === reviewed?.id) ? (
                      <p
                        dir="auto"
                        className="mt-3 rounded-md border border-line bg-bg px-4 py-3 text-ui whitespace-pre-line"
                      >
                        {s.review.feedbackText}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </details>
          </Card>
        ) : null}

        {canSubmit ? (
          <Card aria-labelledby="h-help">
            <CardHead title="گیر کردی؟" titleId="h-help" />
            <p className="mb-3 text-sm text-fg-2">
              مشاورت این‌جاست. سؤالت را بپرس یا اگر وقت کم داری بگو.
            </p>
            {/* UX decision: "Request extension" is a question to the mentor (only staff extend). */}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/my/questions/new?taskId=${task.id}`}
                className={buttonClass({ className: 'max-md:flex-1' })}
              >
                <Icon name="chat" size={16} />
                سؤال درباره‌ی این کار
              </Link>
              <Link
                href={`/my/questions/new?taskId=${task.id}&kind=extension`}
                className={buttonClass({ className: 'max-md:flex-1' })}
              >
                <Icon name="clock" size={16} />
                وقت بیشتری لازم دارم
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
