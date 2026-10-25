import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { faFullDate, faHours, faNumber } from '@/components/format/fa';
import { type RedNoAction, StuckRows } from '@/components/health/stuck-rows';
import { Icon, type IconName } from '@/components/icons/icon';
import { QuestionRows } from '@/components/questions/question-rows';
import { ReminderButton } from '@/components/reminders/reminder-form';
import { ReminderList } from '@/components/reminders/reminder-list';
import { QuickAddButton } from '@/components/shell/quick-add';
import { MentorFilter } from '@/components/stages/mentor-filter';
import { ReviewQueueList } from '@/components/tasks/review-queue-list';
import { Avatar } from '@/components/ui/avatar';
import { Count, Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import { listStages } from '@/modules/catalog/service';
import { listMentors } from '@/modules/identity/service';
import type { StaffQuestionListItemDTO } from '@/modules/questions/contracts';
import type { StudentListItemDTO } from '@/modules/students/contracts';
import type { ReviewQueueItemDTO } from '@/modules/tasks/contracts';
import type { TodayDTO, WaitingOnUsItemDTO } from '@/modules/today/contracts';
import { todayQuery } from '@/modules/today/contracts';
import { getToday } from '@/modules/today/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { param, stagePositions } from '../_data';

export const metadata: Metadata = { title: 'امروز' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * M1 «امروز» (mockups/today.html, user-flows §6): what is past its response time first, the
 * four counters (each jumps to its section), then reminders and reviews (what I do today) next
 * to questions and stuck students (what waits). An admin can narrow everything to one mentor.
 * Stuck students carry their reasons, «توپ در زمین …» and «بدون اقدام» (user-flows §7).
 */
export default async function TodayPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const isAdmin = user.role === 'admin';
  const sp = await searchParams;
  const mentorParam = isAdmin ? param(sp.mentor) : '';
  const mentorId = mentorParam === 'me' ? user.id : mentorParam;
  const parsed = todayQuery.safeParse(mentorId ? { mentorId } : {});
  const [today, mentors, stages] = await Promise.all([
    getToday(actor, parsed.success ? parsed.data : {}),
    isAdmin ? listMentors(actor) : Promise.resolve([]),
    listStages(actor),
  ]);
  const now = new Date(today.generatedAt);
  const c = today.counts;
  const total = c.reminders + c.reviews + c.unansweredQuestions + c.stuckStudents;
  const breached = today.waitingOnUs.filter((w) => w.breached);
  const owners = mentors.map((m) => ({ id: m.id, label: m.displayName }));
  const showOwner = isAdmin && !mentorId;
  const redNoAction = new Map<string, RedNoAction>(
    today.waitingOnUs
      .filter((w) => w.kind === 'red_no_action')
      .map((w) => [w.studentId, { escalated: Boolean(w.escalated), breached: w.breached }]),
  );
  const churn = today.stuckStudents.filter((s) => s.health?.churnRisk).length;

  return (
    <>
      <PageHead
        eyebrow={faFullDate(now)}
        title="امروز"
        sub={
          total
            ? `${faNumber(total)} مورد برای رسیدگی${breached.length ? ` · ${faNumber(breached.length)} مورد از زمان پاسخ گذشته` : ''}`
            : 'همه‌چیز مرتب است'
        }
        actions={
          <>
            {isAdmin ? (
              <MentorFilter
                param="mentor"
                allowNone={false}
                value={parsed.success ? mentorParam : ''}
                mentors={[
                  { id: 'me', label: 'فقط هنرجوهای خودم' },
                  ...mentors
                    .filter((m) => m.id !== user.id)
                    .map((m) => ({ id: m.id, label: m.displayName })),
                ]}
              />
            ) : null}
            <QuickAddButton className="max-md:hidden" />
          </>
        }
      />

      {breached.length ? <Priority items={breached} today={today} /> : null}

      <nav
        aria-label="خلاصه‌ی امروز"
        className="mb-4 grid grid-cols-2 gap-2 md:mb-6 md:gap-4 xl:grid-cols-4"
      >
        <Kpi
          href="#reminders"
          icon="bell"
          tone="sky"
          value={c.reminders}
          label="یادآور امروز"
          sub={c.overdueReminders ? `${faNumber(c.overdueReminders)} گذشته` : null}
        />
        <Kpi
          href="#reviews"
          icon="hourglass"
          tone="brand"
          value={c.reviews}
          label="تحویل منتظر بازبینی"
          sub={c.breachedReviews ? `${faNumber(c.breachedReviews)} دیر` : null}
        />
        <Kpi
          href="#questions"
          icon="chat"
          tone="plum"
          value={c.unansweredQuestions}
          label="سؤال بی‌پاسخ"
          sub={null}
        />
        <Kpi
          href="#stuck"
          icon="flag"
          tone="red"
          value={c.stuckStudents}
          label="هنرجوی گیرکرده"
          sub={churn ? `${faNumber(churn)} خطر ریزش` : null}
        />
      </nav>

      {total === 0 ? (
        <Card className="mb-4 md:mb-5">
          <EmptyState
            icon="check-circle"
            tone="ok"
            title="امروز کار عقب‌مانده‌ای نیست"
            headingLevel={2}
          >
            یادآوری، تحویلی یا سؤالی منتظر تو نیست. وقت خوبی برای مرور هنرجوهاست.
          </EmptyState>
        </Card>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card id="reminders" aria-labelledby="h-rem" className="scroll-mt-20">
            <CardHead
              title={
                <>
                  یادآورها <span className="text-sm font-normal text-fg-3">امروز و گذشته</span>
                </>
              }
              titleId="h-rem"
              icon="bell"
              actions={
                <span className="flex items-center gap-1">
                  <ReminderButton
                    owners={owners}
                    viewerId={user.id}
                    label="یادآور"
                    variant="ghost"
                    size="sm"
                  />
                  <Link
                    href="/reminders"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
                  >
                    همه‌ی یادآورها
                    <Icon name="chev-next" size={14} />
                  </Link>
                </span>
              }
            />
            <ReminderList
              reminders={today.reminders}
              viewerId={user.id}
              showOwner={showOwner}
              emptyText="برای امروز یادآوری نداری."
            />
          </Card>

          <Card id="reviews" aria-labelledby="h-rev" className="scroll-mt-20">
            <CardHead
              title={
                <>
                  تحویل‌های منتظر بازبینی
                  {c.reviews ? (
                    <Count value={c.reviews} tone="brand" label={`${faNumber(c.reviews)} تحویل`} />
                  ) : null}
                </>
              }
              titleId="h-rev"
              icon="hourglass"
              link={{ href: '/tasks', label: 'همه' }}
            />
            {today.reviewQueue.length ? (
              <ReviewQueueList
                items={today.reviewQueue}
                viewerId={user.id}
                showReviewer={showOwner}
                now={now}
              />
            ) : (
              <EmptyState icon="check-circle" tone="ok" title="تحویلی منتظر نیست" className="py-5">
                هر تحویل تازه همین‌جا با زمان باقی‌مانده تا موعد بازبینی می‌آید.
              </EmptyState>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card id="questions" aria-labelledby="h-q" className="scroll-mt-20">
            <CardHead
              title="سؤال‌های بی‌پاسخ"
              titleId="h-q"
              icon="chat"
              count={c.unansweredQuestions || undefined}
              countLabel={`${faNumber(c.unansweredQuestions)} سؤال بی‌پاسخ`}
              link={{ href: '/questions', label: 'صف سؤال‌ها' }}
            />
            {today.unansweredQuestions.length ? (
              <QuestionRows
                items={today.unansweredQuestions}
                now={now}
                viewerId={user.id}
                showAssignee={showOwner}
              />
            ) : (
              <EmptyState icon="chat" tone="ok" title="سؤال بی‌پاسخی نیست" className="py-5">
                سؤال‌های هنرجوها، نزدیک‌ترین به موعد اول، همین‌جا می‌آیند.
              </EmptyState>
            )}
          </Card>

          <Card id="stuck" aria-labelledby="h-s" className="scroll-mt-20">
            <CardHead
              title="هنرجوهای گیرکرده"
              titleId="h-s"
              icon="flag"
              count={c.stuckStudents || undefined}
              countLabel={`${faNumber(c.stuckStudents)} هنرجوی گیرکرده`}
              link={{ href: '/students?health=red', label: 'همه‌ی گیرکرده‌ها' }}
            />
            {today.stuckStudents.length ? (
              <StuckRows
                items={today.stuckStudents}
                viewerId={user.id}
                positions={stagePositions(stages)}
                redNoAction={redNoAction}
                now={now}
              />
            ) : (
              <EmptyState
                icon="check-circle"
                tone="ok"
                title="هنرجوی گیرکرده‌ای نیست"
                className="py-5"
              >
                وقتی هنرجویی گیر کند، با دلیل و «توپ در زمین چه کسی» همین‌جا می‌آید.
              </EmptyState>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

const kpiTones = {
  sky: 'bg-st-progress-bg text-st-progress-fg',
  brand: 'bg-primary-weak-2 text-primary-text',
  plum: 'bg-av-2-bg text-av-2-fg',
  red: 'bg-h-red-bg text-h-red-fg',
} as const;

function Kpi({
  href,
  icon,
  tone,
  value,
  label,
  sub,
}: {
  href: string;
  icon: IconName;
  tone: keyof typeof kpiTones;
  value: number;
  label: string;
  sub: string | null;
}) {
  return (
    <a
      href={href}
      className="grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-lg border border-line bg-surface p-3 text-fg shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary-line hover:shadow-md md:gap-x-4 md:p-5"
    >
      <span
        aria-hidden="true"
        className={cn(
          'row-span-2 grid size-9 place-items-center rounded-[10px] md:size-11 md:rounded-xl',
          kpiTones[tone],
        )}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="flex items-baseline gap-2 text-kpi-mob font-extrabold tabular-nums md:text-kpi">
        {faNumber(value)}
        {sub ? (
          <span className="self-center rounded-full bg-h-red-bg px-1.5 py-[3px] text-2xs leading-none font-bold text-h-red-fg md:px-2 md:text-xs">
            {sub}
          </span>
        ) : null}
      </span>
      <span className="text-xs font-medium text-fg-2 md:text-ui">{label}</span>
    </a>
  );
}

/** «از زمان پاسخ گذشته» (mockups `.priority`): breached waiting items, oldest first. */
function Priority({ items, today }: { items: WaitingOnUsItemDTO[]; today: TodayDTO }) {
  const reviews = new Map<string, ReviewQueueItemDTO>(today.reviewQueue.map((r) => [r.taskId, r]));
  const students = new Map<string, StudentListItemDTO>(today.stuckStudents.map((s) => [s.id, s]));
  const questions = new Map<string, StaffQuestionListItemDTO>(
    today.unansweredQuestions.map((q) => [q.id, q]),
  );
  return (
    <section
      aria-labelledby="h-pri"
      className="mb-4 overflow-hidden rounded-lg border border-h-red-bd bg-surface shadow-sm md:mb-5"
    >
      <div className="flex flex-wrap items-center gap-3 bg-h-red-bg px-4 py-3 text-ui font-bold text-h-red-fg md:px-5">
        <Icon name="clock" />
        <h2 id="h-pri" className="text-ui">
          از زمان پاسخ گذشته
        </h2>
        <span className="font-medium opacity-90">{`${faNumber(items.length)} مورد · اول به این‌ها برس`}</span>
      </div>
      <ul>
        {items.map((w) => {
          const review = w.kind === 'review' ? reviews.get(w.refId) : undefined;
          const student = students.get(w.studentId);
          const question = w.kind === 'question' ? questions.get(w.refId) : undefined;
          const name =
            review?.student.displayName ??
            question?.student.displayName ??
            student?.displayName ??
            'هنرجو';
          let title: ReactNode;
          let href: string;
          let action: string;
          if (w.kind === 'review') {
            title = (
              <>
                تحویل منتظر بازبینی: <bdi>{review?.title ?? ''}</bdi>
              </>
            );
            href = `/tasks/${w.refId}`;
            action = 'بازبینی کن';
          } else if (w.kind === 'question') {
            title = (
              <>
                سؤال بی‌پاسخ{question ? ': ' : ''}
                {question ? <bdi>{question.subject}</bdi> : null}
              </>
            );
            href = `/questions/${w.refId}`;
            action = 'پاسخ';
          } else {
            title = w.escalated
              ? 'هنرجوی قرمز بدون اقدام · ارجاع به بنیان‌گذار'
              : 'هنرجوی گیرکرده بدون اقدام ثبت‌شده';
            href = `/students/${w.studentId}?add=note`;
            action = 'ثبت اقدام';
          }
          return (
            <li
              key={`${w.kind}-${w.refId}`}
              className="flex items-center gap-4 border-t border-line px-4 py-3 first:border-t-0 max-md:flex-wrap md:px-5"
            >
              <Avatar id={w.studentId} name={name} />
              <div className="min-w-0 flex-1">
                <Link href={href} className="block font-semibold text-fg hover:text-link">
                  {title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                  <span className="font-medium">{name}</span>
                  <Tag variant="late">{`دیر · ${faHours(w.elapsedHours)}`}</Tag>
                  <span className="text-fg-3">{`مهلت پاسخ: ${faHours(w.slaHours)}`}</span>
                </div>
              </div>
              <Link
                href={href}
                className={buttonClass({
                  size: 'sm',
                  variant: w.kind === 'red_no_action' ? 'secondary' : 'primary',
                  className: 'max-md:w-full',
                })}
              >
                {action}
                <Icon name="chev-next" size={14} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
