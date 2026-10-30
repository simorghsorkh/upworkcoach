import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { faDate, faDayMonth, faDays, faDayTime, faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { submissionTypeLabel } from '@/components/tasks/labels';
import { EditReviewButton, ReviewForm } from '@/components/tasks/review-form';
import { sortQueue } from '@/components/tasks/review-queue-list';
import { SubmissionContent } from '@/components/tasks/submission-content';
import { TaskActions } from '@/components/tasks/task-actions';
import { DueText, SlaText, TaskStatusBadge } from '@/components/tasks/task-bits';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PathBar } from '@/components/ui/path-bar';
import { PlatformBadge } from '@/components/ui/platform';
import { Alert } from '@/components/ui/states';
import { listStages } from '@/modules/catalog/service';
import type { StaffStudentDTO } from '@/modules/students/contracts';
import { getStudent } from '@/modules/students/service';
import type {
  StaffReviewDTO,
  StaffSubmissionDTO,
  StaffTaskDetailDTO,
} from '@/modules/tasks/contracts';
import { getReviewQueue, getStaffTask } from '@/modules/tasks/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';
import { param, stagePositions } from '../../_data';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function load(id: string) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  try {
    const task = await getStaffTask(actor, id);
    const [student, stages, queue] = await Promise.all([
      getStudent(actor, task.student.id).catch(() => null),
      listStages(actor),
      getReviewQueue(actor, {}),
    ]);
    return { user, task, student, stages, queue };
  } catch (err) {
    // Missing and out-of-scope look the same (ADR-0004).
    if (err instanceof ApiError && (err.status === 404 || err.status === 403 || err.status === 422))
      notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  try {
    const user = await requireUser(['admin', 'mentor']);
    const task = await getStaffTask(toActor(user), id);
    return { title: task.title };
  } catch {
    return { title: 'کار' };
  }
}

const ACCEPT_MARK = 'وقتی قبول است که:';

/** "Task description" with the acceptance criterion pulled out (mockups `.alert-neutral`). */
function Description({ text }: { text: string | null }) {
  if (!text) return <p className="text-sm text-fg-3">شرحی نوشته نشده است.</p>;
  const at = text.indexOf(ACCEPT_MARK);
  const main = (at === -1 ? text : text.slice(0, at)).trim();
  const criterion = at === -1 ? '' : text.slice(at + ACCEPT_MARK.length).trim();
  return (
    <>
      {main ? (
        <p dir="auto" className="text-sm leading-6 whitespace-pre-line">
          {main}
        </p>
      ) : null}
      {criterion ? (
        <Alert tone="neutral" icon="target" title={ACCEPT_MARK} className="mt-3 mb-0">
          <span dir="auto" className="whitespace-pre-line">
            {criterion}
          </span>
        </Alert>
      ) : null}
    </>
  );
}

function ReviewBlock({ review, version }: { review: StaffReviewDTO; version: number }) {
  const accepted = review.outcome === 'accepted';
  return (
    <div
      className={cn(
        'mt-4 rounded-md border px-4 py-3',
        accepted ? 'border-h-green-bd bg-h-green-bg' : 'border-h-yellow-bd bg-h-yellow-bg',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <TaskStatusBadge status={accepted ? 'accepted' : 'changes_requested'} />
        <span className="text-fg-2">{`بازخورد نسخه‌ی ${faNumber(version)} · ${review.reviewer.displayName} · ${faDate(new Date(review.createdAt))}`}</span>
        {review.score ? <Tag>{`امتیاز ${faNumber(review.score)} از ۵`}</Tag> : null}
        {review.editable ? (
          <span className="ms-auto">
            <EditReviewButton review={review} />
          </span>
        ) : null}
      </div>
      <p
        dir="auto"
        className="text-ui leading-6 whitespace-pre-line text-fg [overflow-wrap:anywhere]"
      >
        {review.feedbackText}
      </p>
    </div>
  );
}

type HistoryItem = { at: string; who: string; text: ReactNode };

function history(task: StaffTaskDetailDTO): HistoryItem[] {
  const items: HistoryItem[] = [
    { at: task.createdAt, who: task.createdBy.displayName, text: 'کار ساخته شد' },
  ];
  for (const e of task.extensions) {
    items.push({
      at: e.createdAt,
      who: e.actor.displayName,
      text: (
        <>
          {`تمدید مهلت ${faDayMonth(new Date(e.previousDueAt))} ← ${faDayMonth(new Date(e.newDueAt))} · `}
          <span dir="auto">«{e.reason}»</span>
        </>
      ),
    });
  }
  for (const s of task.submissions) {
    items.push({
      at: s.createdAt,
      who: s.submittedBy.displayName,
      text: `تحویل نسخه‌ی ${faNumber(s.version)}`,
    });
    if (s.review) {
      items.push({
        at: s.review.createdAt,
        who: s.review.reviewer.displayName,
        text:
          s.review.outcome === 'accepted'
            ? 'پذیرفته شد'
            : `نیاز به اصلاح (نسخه‌ی ${faNumber(s.version)})`,
      });
    }
  }
  if (task.status === 'cancelled' && task.closedAt) {
    items.push({
      at: task.closedAt,
      who: '',
      text: (
        <>
          لغو شد
          {task.cancelReason ? (
            <>
              {' '}
              · <span dir="auto">«{task.cancelReason}»</span>
            </>
          ) : null}
        </>
      ),
    });
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** M6 — task, submissions and review (mockups/task-detail.html). */
export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, task, student, stages, queue } = await load(id);
  const now = new Date();
  const firstName = task.student.displayName.trim().split(/\s+/)[0] ?? task.student.displayName;
  const latest: StaffSubmissionDTO | undefined = task.submissions[0];
  const wanted = Number(param(sp.v));
  const shown = task.submissions.find((s) => s.version === wanted) ?? latest;
  const queueItem = queue.find((q) => q.taskId === task.id);
  const awaiting = task.status === 'submitted' && latest && !latest.review;
  const previousReview = task.submissions.find(
    (s) => s.review && s.version < (shown?.version ?? 0),
  );
  const sorted = sortQueue(queue).filter((q) => q.taskId !== task.id);
  const nextHref = sorted[0] ? `/tasks/${sorted[0].taskId}` : '/today#reviews';
  const positions = stagePositions(stages);
  const actionTask = { ...task, studentFirstName: firstName };

  return (
    <>
      <nav
        aria-label="مسیر"
        className="mb-3 hidden flex-wrap items-center gap-1.5 text-sm text-fg-3 md:flex"
      >
        <Link href="/tasks" className="font-medium text-fg-2 hover:text-link">
          کارها
        </Link>
        <Icon name="chev-next" size={14} />
        <Link
          href={`/students/${task.student.id}`}
          className="font-medium text-fg-2 hover:text-link"
        >
          {task.student.displayName}
        </Link>
        <Icon name="chev-next" size={14} />
        <span aria-current="page" className="font-semibold text-fg">
          کار
        </span>
      </nav>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-4 md:mb-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h1 className="min-w-0 flex-1 text-mob-h1 md:text-2xl">
              <bdi>{task.title}</bdi>
            </h1>
            <span className="md:hidden">
              <TaskActions task={actionTask} layout="menu" />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fg-2">
            <TaskStatusBadge
              status={task.status}
              version={latest?.version}
              round={task.revisionCount}
              label={awaiting && task.reviewer.id === user.id ? 'منتظر بازبینی شما' : undefined}
            />
            {queueItem ? (
              <SlaText
                breached={queueItem.breached}
                warning={queueItem.warning}
                elapsedHours={queueItem.elapsedHours}
                slaRemainingHours={queueItem.slaRemainingHours}
                lastSubmittedAt={queueItem.lastSubmittedAt}
                now={now}
              />
            ) : null}
            {task.priority === 'urgent' ? <Tag variant="urgent">فوری</Tag> : null}
            {task.requiredForGate ? <Tag variant="gate">اجباری برای عبور</Tag> : null}
            <span className="inline-flex items-center gap-1">
              مهلت:{' '}
              <DueText
                dueAt={task.dueAt}
                status={task.status}
                overdue={task.overdue}
                overdueDays={task.overdueDays}
                now={now}
                extensions={task.extensionCount}
              />
            </span>
            {task.stage ? <span>{`مرحله‌ی ${task.stage.displayCode}`}</span> : null}
            <span className="inline-flex items-center gap-1">
              <Icon name="file" size={14} className="text-fg-3" />
              {submissionTypeLabel[task.submissionType]}
            </span>
          </div>
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <TaskActions
            task={actionTask}
            initialPanel={param(sp.do) === 'extend' ? 'extend' : undefined}
          />
        </div>
      </header>

      {task.revisionCount >= 3 && task.status !== 'accepted' && task.status !== 'cancelled' ? (
        <Alert
          tone="warn"
          title={`دور ${faNumber(task.revisionCount)} اصلاح:`}
          action={
            <Link
              href={`/students/${task.student.id}?add=note`}
              className={buttonClass({ size: 'sm' })}
            >
              <Icon name="phone" size={14} />
              ثبت تماس
            </Link>
          }
        >
          بازخورد مکتوب کافی نبوده است. پیشنهاد: به‌جای دور بعدی، یک تماس ۱۵ دقیقه‌ای.
        </Alert>
      ) : null}
      {task.status === 'cancelled' ? (
        <Alert tone="neutral" title="این کار لغو شده است.">
          {task.cancelReason ? <span dir="auto">{` دلیل: ${task.cancelReason}`}</span> : null}
        </Alert>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card aria-labelledby="h-sub">
            <CardHead
              title={
                <>
                  <Avatar id={task.student.id} name={task.student.displayName} size="sm" />
                  {`تحویل ${firstName}`}
                </>
              }
              titleId="h-sub"
              actions={
                task.submissions.length > 1 ? (
                  <nav
                    aria-label="نسخه‌ها"
                    className="inline-flex flex-wrap gap-0.5 rounded-[10px] border border-line bg-surface-3 p-[3px]"
                  >
                    {[...task.submissions].reverse().map((s) => {
                      const current = s.version === shown?.version;
                      return (
                        <Link
                          key={s.id}
                          href={
                            s.version === latest?.version
                              ? `/tasks/${task.id}`
                              : `/tasks/${task.id}?v=${s.version}`
                          }
                          scroll={false}
                          aria-current={current ? 'page' : undefined}
                          className={cn(
                            'inline-flex min-h-8 items-center rounded-[7px] px-3 text-sm font-semibold',
                            current ? 'bg-surface text-fg shadow-sm' : 'text-fg-2 hover:text-fg',
                          )}
                        >
                          {s.version === latest?.version
                            ? `${faNumber(s.version)} · آخرین`
                            : faNumber(s.version)}
                        </Link>
                      );
                    })}
                  </nav>
                ) : null
              }
            />
            {shown ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-fg-2">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="clock" size={14} className="text-fg-3" />
                    {faDayTime(new Date(shown.createdAt), now)}
                  </span>
                  <span className="text-line-2">·</span>
                  <span>{`نسخه‌ی ${faNumber(shown.version)}`}</span>
                  {task.submissionType === 'proposal_review' ? (
                    <Tag icon={shown.aiUseConsent ? 'check' : 'lock'}>
                      {`رضایت برای استفاده‌ی بی‌نام: ${shown.aiUseConsent ? 'بله' : 'نه'}`}
                    </Tag>
                  ) : null}
                  {shown.platform ? (
                    <PlatformBadge name={shown.platform.name} className="md:hidden" />
                  ) : null}
                </div>
                <SubmissionContent submission={{ ...shown, platform: shown.platform }} />
                {shown.review ? (
                  <ReviewBlock review={shown.review} version={shown.version} />
                ) : null}
                {!shown.review && previousReview?.review ? (
                  <details className="group mt-4 border-t border-line pt-3">
                    <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-ui font-semibold text-fg-2 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                      {`بازخورد نسخه‌ی ${faNumber(previousReview.version)}`}
                      <span className="font-normal text-fg-3">
                        {`(${previousReview.review.reviewer.displayName}، ${faDayMonth(new Date(previousReview.review.createdAt))})`}
                      </span>
                      <Icon
                        name="chev-down"
                        size={16}
                        className="transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <p
                      dir="auto"
                      className="mt-2 rounded-md border border-line bg-bg px-4 py-3 text-ui whitespace-pre-line"
                    >
                      {previousReview.review.feedbackText}
                    </p>
                  </details>
                ) : null}
              </>
            ) : (
              <p className="py-4 text-center text-sm text-fg-3">
                {task.status === 'cancelled'
                  ? 'پیش از لغو، تحویلی ثبت نشده بود.'
                  : `${firstName} هنوز تحویل نداده است. وقتی تحویل بدهد، این‌جا و در «امروز» می‌آید.`}
              </p>
            )}
          </Card>

          {awaiting && latest && shown?.id === latest.id ? (
            <Card id="review" aria-labelledby="h-rv" className="scroll-mt-20">
              <CardHead
                title="بازبینی شما"
                titleId="h-rv"
                icon="pen"
                actions={<Tag variant="outline">قالب بازخورد مشاور</Tag>}
              />
              {/* slot: ai-feedback (1.0) — the AI feedback block goes above this form; none in 0.1. */}
              <ReviewForm
                submissionId={latest.id}
                version={latest.version}
                studentFirstName={firstName}
                scoreLabel={
                  task.submissionType === 'proposal_review'
                    ? 'امتیاز این پروپوزال'
                    : 'امتیاز این کار'
                }
                nextHref={nextHref}
              />
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:gap-5 lg:sticky lg:top-6">
          <Card aria-labelledby="h-desc">
            <CardHead title="شرح کار" titleId="h-desc" icon="file" />
            <Description text={task.description} />
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
              <span>{`ساخته‌شده: ${task.createdBy.displayName}، ${faDayMonth(new Date(task.createdAt))}`}</span>
              <span className="text-line-2">·</span>
              <span>{`بازبین: ${task.reviewer.id === user.id ? 'خودم' : task.reviewer.displayName}`}</span>
            </div>
          </Card>

          {student ? (
            <AtAGlance
              student={student}
              position={positions.get(student.stage.id) ?? 0}
              total={stages.length}
            />
          ) : null}

          <Card aria-labelledby="h-hist">
            <CardHead title="تاریخچه" titleId="h-hist" icon="clock" />
            <ol className="relative mt-1 before:absolute before:start-[13px] before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
              {history(task).map((h) => (
                <li
                  key={`${h.at}-${typeof h.text === 'string' ? h.text : 'x'}`}
                  className="relative ps-11 pb-4 last:pb-0"
                >
                  <span
                    aria-hidden="true"
                    className="absolute start-[7px] top-1.5 size-3.5 rounded-full border-[3px] border-surface bg-surface-3"
                  />
                  <div className="text-sm text-fg-3">
                    {[faDayTime(new Date(h.at), now), h.who].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-0.5 text-sm text-fg-2">{h.text}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function AtAGlance({
  student: s,
  position,
  total,
}: {
  student: StaffStudentDTO;
  position: number;
  total: number;
}) {
  const firstName = s.displayName.trim().split(/\s+/)[0] ?? s.displayName;
  const rows: Array<[string, ReactNode]> = [
    [
      'مرحله',
      <span key="stage" className="flex flex-col items-start gap-1.5">
        <span>{`${s.stage.displayCode} ${s.stage.name} · ${faDays(s.daysInStage)}`}</span>
        <PathBar current={position} total={total} />
      </span>,
    ],
    [
      'ویترین',
      s.primaryProfile ? (
        <span key="pp" className="inline-flex flex-wrap items-center gap-1.5">
          <PlatformBadge name={s.primaryProfile.platformName} />
          {s.primaryProfile.headline ? (
            <bdi dir="ltr" className="text-sm">
              {s.primaryProfile.headline}
            </bdi>
          ) : null}
        </span>
      ) : (
        <span key="pp" className="text-fg-3">
          ندارد
        </span>
      ),
    ],
    [
      'نیچ',
      s.nicheStatement ? (
        <bdi key="n" dir="auto">
          {s.nicheStatement}
        </bdi>
      ) : (
        <span key="n" className="text-fg-3">
          —
        </span>
      ),
    ],
    ['کارهای باز', `${faNumber(s.openTaskCount)} · ${faNumber(s.overdueTaskCount)} معوق`],
    ['انگلیسی', s.englishWriting === null ? '—' : `نوشتاری ${faNumber(s.englishWriting)} از ۵`],
  ];
  return (
    <Card aria-labelledby="h-sum">
      <CardHead
        title={
          <>
            <Avatar id={s.id} name={s.displayName} size="sm" />
            {`${firstName} در یک نگاه`}
          </>
        }
        titleId="h-sum"
        link={{ href: `/students/${s.id}`, label: 'پرونده' }}
      />
      <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-ui">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-3">{k}</dt>
            <dd className="m-0 min-w-0 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
