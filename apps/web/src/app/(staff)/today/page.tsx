import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { type RedNoAction, StuckRows } from '@/components/health/stuck-rows';
import { Icon } from '@/components/icons/icon';
import { SessionList } from '@/components/mentoring/session-bits';
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
import { Kpi } from '@/components/ui/kpi';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import { getFormat } from '@/i18n/server-format';
import { listStages } from '@/modules/catalog/service';
import { listMentors } from '@/modules/identity/service';
import { upcomingSessionsFor } from '@/modules/mentoring/service';
import type { StaffQuestionListItemDTO } from '@/modules/questions/contracts';
import type { StudentListItemDTO } from '@/modules/students/contracts';
import type { ReviewQueueItemDTO } from '@/modules/tasks/contracts';
import type { TodayDTO, WaitingOnUsItemDTO } from '@/modules/today/contracts';
import { todayQuery } from '@/modules/today/contracts';
import { getToday } from '@/modules/today/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { param, stagePositions } from '../_data';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('today') };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * M1 «امروز» (mockups/today.html, user-flows §6): what is past its response time first, the
 * four counters (each jumps to its section), then reminders and reviews (what I do today) next
 * to questions and stuck students (what waits). An admin can narrow everything to one mentor.
 * Stuck students carry their reasons, «توپ در زمین …» and «بدون اقدام» (user-flows §7).
 * Sprint 5b: mentoring sessions of the next 7 days, those within 24 hours marked (the
 * internal reminder of ADR-0012 §7).
 */
export default async function TodayPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const [t, ts, format] = await Promise.all([
    getTranslations('today'),
    getTranslations('mentoring.today'),
    getFormat(),
  ]);
  const isAdmin = user.role === 'admin';
  const sp = await searchParams;
  const mentorParam = isAdmin ? param(sp.mentor) : '';
  const mentorId = mentorParam === 'me' ? user.id : mentorParam;
  const parsed = todayQuery.safeParse(mentorId ? { mentorId } : {});
  const [today, mentors, stages, sessionsAhead] = await Promise.all([
    getToday(actor, parsed.success ? parsed.data : {}),
    isAdmin ? listMentors(actor) : Promise.resolve([]),
    listStages(actor),
    upcomingSessionsFor(actor, new Date()),
  ]);
  const now = new Date(today.generatedAt);
  const sessions =
    isAdmin && parsed.success && mentorId
      ? sessionsAhead.filter((s) => s.mentor.id === mentorId)
      : sessionsAhead;
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
        eyebrow={format.fullDate(now)}
        title={t('title')}
        sub={
          total
            ? `${t('pending', { count: total })}${breached.length ? ` · ${t('pendingBreached', { count: breached.length })}` : ''}`
            : t('allClear')
        }
        actions={
          <>
            {isAdmin ? (
              <MentorFilter
                param="mentor"
                allowNone={false}
                value={parsed.success ? mentorParam : ''}
                mentors={[
                  { id: 'me', label: t('onlyMine') },
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
        aria-label={t('summary')}
        className="mb-4 grid grid-cols-2 gap-2 md:mb-6 md:gap-4 xl:grid-cols-4"
      >
        <Kpi
          href="#reminders"
          icon="bell"
          tone="sky"
          value={c.reminders}
          label={t('kpiReminders')}
          sub={c.overdueReminders ? t('overdue', { count: c.overdueReminders }) : null}
        />
        <Kpi
          href="#reviews"
          icon="hourglass"
          tone="brand"
          value={c.reviews}
          label={t('kpiReviews')}
          sub={c.breachedReviews ? t('late', { count: c.breachedReviews }) : null}
        />
        <Kpi
          href="#questions"
          icon="chat"
          tone="plum"
          value={c.unansweredQuestions}
          label={t('kpiQuestions')}
          sub={null}
        />
        <Kpi
          href="#stuck"
          icon="flag"
          tone="red"
          value={c.stuckStudents}
          label={t('kpiStuck')}
          sub={churn ? t('churn', { count: churn }) : null}
        />
      </nav>

      {total === 0 ? (
        <Card className="mb-4 md:mb-5">
          <EmptyState icon="check-circle" tone="ok" title={t('emptyTitle')} headingLevel={2}>
            {t('emptyBody')}
          </EmptyState>
        </Card>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          {sessions.length ? (
            <Card id="sessions" aria-labelledby="h-sessions" className="scroll-mt-20">
              <CardHead
                title={
                  <>
                    {ts('title')} <span className="text-sm font-normal text-fg-3">{ts('sub')}</span>
                  </>
                }
                titleId="h-sessions"
                icon="calendar"
                count={sessions.length}
              />
              <SessionList
                sessions={sessions}
                now={now}
                showRun
                showMentor={showOwner}
                empty={ts('empty')}
              />
            </Card>
          ) : null}
          <Card id="reminders" aria-labelledby="h-rem" className="scroll-mt-20">
            <CardHead
              title={
                <>
                  {t('remindersTitle')}{' '}
                  <span className="text-sm font-normal text-fg-3">{t('remindersSub')}</span>
                </>
              }
              titleId="h-rem"
              icon="bell"
              actions={
                <span className="flex items-center gap-1">
                  <ReminderButton
                    owners={owners}
                    viewerId={user.id}
                    label={t('reminderButton')}
                    variant="ghost"
                    size="sm"
                  />
                  <Link
                    href="/reminders"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
                  >
                    {t('allReminders')}
                    <Icon name="chev-next" size={14} />
                  </Link>
                </span>
              }
            />
            <ReminderList
              reminders={today.reminders}
              viewerId={user.id}
              showOwner={showOwner}
              emptyText={t('noReminders')}
            />
          </Card>

          <Card id="reviews" aria-labelledby="h-rev" className="scroll-mt-20">
            <CardHead
              title={
                <>
                  {t('reviewsTitle')}
                  {c.reviews ? (
                    <Count
                      value={c.reviews}
                      tone="brand"
                      label={t('reviewsCount', { count: c.reviews })}
                    />
                  ) : null}
                </>
              }
              titleId="h-rev"
              icon="hourglass"
              link={{ href: '/tasks', label: t('all') }}
            />
            {today.reviewQueue.length ? (
              <ReviewQueueList
                items={today.reviewQueue}
                viewerId={user.id}
                showReviewer={showOwner}
                now={now}
              />
            ) : (
              <EmptyState
                icon="check-circle"
                tone="ok"
                title={t('noReviewsTitle')}
                className="py-5"
              >
                {t('noReviewsBody')}
              </EmptyState>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card id="questions" aria-labelledby="h-q" className="scroll-mt-20">
            <CardHead
              title={t('questionsTitle')}
              titleId="h-q"
              icon="chat"
              count={c.unansweredQuestions || undefined}
              countLabel={t('questionsCount', { count: c.unansweredQuestions })}
              link={{ href: '/questions', label: t('questionQueue') }}
            />
            {today.unansweredQuestions.length ? (
              <QuestionRows
                items={today.unansweredQuestions}
                now={now}
                viewerId={user.id}
                showAssignee={showOwner}
              />
            ) : (
              <EmptyState icon="chat" tone="ok" title={t('noQuestionsTitle')} className="py-5">
                {t('noQuestionsBody')}
              </EmptyState>
            )}
          </Card>

          <Card id="stuck" aria-labelledby="h-s" className="scroll-mt-20">
            <CardHead
              title={t('stuckTitle')}
              titleId="h-s"
              icon="flag"
              count={c.stuckStudents || undefined}
              countLabel={t('stuckCount', { count: c.stuckStudents })}
              link={{ href: '/students?health=red', label: t('allStuck') }}
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
              <EmptyState icon="check-circle" tone="ok" title={t('noStuckTitle')} className="py-5">
                {t('noStuckBody')}
              </EmptyState>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

async function Priority({ items, today }: { items: WaitingOnUsItemDTO[]; today: TodayDTO }) {
  const [t, format] = await Promise.all([getTranslations('today'), getFormat()]);
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
          {t('priorityTitle')}
        </h2>
        <span className="font-medium opacity-90">{t('prioritySub', { count: items.length })}</span>
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
            t('studentFallback');
          let title: ReactNode;
          let href: string;
          let action: string;
          if (w.kind === 'review') {
            title = t.rich('reviewItem', {
              title: review?.title ?? '',
              bdi: (chunks: ReactNode) => <bdi>{chunks}</bdi>,
            });
            href = `/tasks/${w.refId}`;
            action = t('review');
          } else if (w.kind === 'question') {
            title = question
              ? t.rich('questionItemWith', {
                  subject: question.subject,
                  bdi: (chunks: ReactNode) => <bdi>{chunks}</bdi>,
                })
              : t('questionItem');
            href = `/questions/${w.refId}`;
            action = t('answer');
          } else {
            title = w.escalated ? t('redEscalated') : t('redNoAction');
            href = `/students/${w.studentId}?add=note`;
            action = t('recordAction');
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
                  <Tag variant="late">{t('lateBy', { hours: format.hours(w.elapsedHours) })}</Tag>
                  <span className="text-fg-3">{t('sla', { hours: format.hours(w.slaHours) })}</span>
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
