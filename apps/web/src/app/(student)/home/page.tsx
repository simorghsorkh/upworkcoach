import type { Metadata } from 'next';
import Link from 'next/link';
import { faDayTime, faFullDate, faNumber } from '@/components/format/fa';
import { formatJalaliLong } from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { moneyText } from '@/components/milestones/staff-milestones';
import {
  StudentQuestionRows,
  sortStudentQuestions,
} from '@/components/questions/student-question-rows';
import { PathCard, stageLine } from '@/components/student/path-card';
import { ProgramsSummary } from '@/components/student/programs-summary';
import { WelcomeCard, type WelcomeStep } from '@/components/student/welcome-card';
import { noteKindLabel } from '@/components/tasks/labels';
import { StudentTaskItem } from '@/components/tasks/student-task-bits';
import { Avatar } from '@/components/ui/avatar';
import { Count, Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import type { CurrentCheckinDTO } from '@/modules/checkins/contracts';
import { getCurrentCheckin } from '@/modules/checkins/service';
import { listSessions } from '@/modules/mentoring/service';
import { listOwnMilestones } from '@/modules/milestones/service';
import { getMyPrograms } from '@/modules/programs/service';
import { listOwnQuestions } from '@/modules/questions/service';
import { listOwnProfiles } from '@/modules/students/service';
import { listOwnTasks } from '@/modules/tasks/service';
import { listOwnSharedNotes } from '@/modules/timeline/service';
import { NoRecord } from '../_components';
import { loadOwn } from '../_load';

export const metadata: Metadata = { title: 'خانه' };

const HOME_TASKS = 5;

/**
 * S1 — student home (mockups/student-home.html): welcome steps on the first days, the weekly
 * check-in card (Thursday–Friday until sent), path, open tasks by deadline (overdue first), my
 * questions with "New answer", the mentor's shared notes and my milestones. Health, rules and
 * internal notes never appear: every source here is a student DTO. Sprint 6b: a summary of the
 * courses and mentoring they are in (progress, current phase, next session, package use).
 */
export default async function HomePage() {
  const { user, actor, path, student } = await loadOwn();
  const firstName = user.displayName.trim().split(/\s+/)[0] ?? user.displayName;
  if (!student || !path) {
    return (
      <>
        <h1 className="mb-4 text-[22px] leading-8 md:text-2xl">{`سلام ${firstName}`}</h1>
        <NoRecord />
      </>
    );
  }
  const now = new Date();
  const [tasks, notes, questions, checkin, milestones, profiles, programs, sessions] =
    await Promise.all([
      listOwnTasks(actor),
      listOwnSharedNotes(actor, { limit: 3 }),
      listOwnQuestions(actor),
      // 404 = check-in turned off: no card at all.
      getCurrentCheckin(actor).catch((): CurrentCheckinDTO | null => null),
      listOwnMilestones(actor),
      listOwnProfiles(actor),
      getMyPrograms(actor),
      listSessions(actor, { when: 'upcoming' }, now),
    ]);
  const courses = programs.filter((p) => !p.run.isLegacy);
  const open = tasks.filter((t) => t.status !== 'accepted' && t.status !== 'cancelled');
  const recentQuestions = sortStudentQuestions(questions.items).slice(0, 3);
  const newReplies = questions.items.filter((q) => q.hasNewReply).length;
  const checkinDue = Boolean(checkin?.open && checkin.existing === null);
  const firstTask = [...open].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  const anySubmitted = tasks.some((t) => t.status !== 'open' && t.status !== 'in_progress');
  const steps: WelcomeStep[] = [
    {
      label: firstTask ? `اولین کارت را انجام بده: «${firstTask.title}»` : 'اولین کارت را ببین',
      href: firstTask ? `/my/tasks/${firstTask.id}` : '/my/tasks',
      minutes: 2,
      done: anySubmitted,
    },
    {
      label: 'اگر پروفایلی در Upwork، Fiverr یا LinkedIn داری، لینکش را بگذار',
      href: '/my/profile',
      minutes: 1,
      done: profiles.length > 0,
    },
    {
      label: 'هدف ۹۰ روزه‌ات را بنویس',
      href: '/my/profile?edit=1#about',
      minutes: 1,
      done: Boolean(student.goal90d),
    },
  ];
  const newcomer = Date.now() - Date.parse(student.joinedAt) < 21 * 86_400_000;

  return (
    <>
      <div className="mb-4 flex items-center gap-4 md:mb-6">
        <Avatar id={user.id} name={user.displayName} size="lg" />
        <div className="min-w-0">
          <h1 className="text-[22px] leading-8 md:text-2xl">{`سلام ${firstName}`}</h1>
          <p className="text-ui text-fg-2">
            {faFullDate(now)}
            {path ? ` · ${stageLine(path)}` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-4 md:gap-5">
        {newcomer ? <WelcomeCard firstName={firstName} steps={steps} /> : null}
        {checkinDue ? (
          <section
            aria-labelledby="h-ci"
            className="flex flex-wrap items-center gap-4 rounded-lg bg-linear-to-br from-brand-700 to-brand-500 p-4 text-on-brand shadow-md md:p-5"
          >
            <span
              aria-hidden="true"
              className="grid size-11 flex-none place-items-center rounded-xl bg-white/15"
            >
              <Icon name="checkin" size={24} />
            </span>
            <div className="min-w-[180px] flex-1">
              <h2 id="h-ci" className="text-h2 text-on-brand">
                <bdi>check-in</bdi> این هفته
              </h2>
              <p className="text-sm text-on-brand">{`۳ دقیقه · ${student.mentor?.displayName ?? 'مشاورت'} شنبه می‌خواندش`}</p>
            </div>
            <Link
              href="/my/checkin"
              className={buttonClass({ size: 'lg', className: 'max-md:w-full' })}
            >
              شروع
              <Icon name="next" size={16} />
            </Link>
          </section>
        ) : null}
        <PathCard path={path} />
        {courses.length ? (
          <ProgramsSummary programs={courses} sessions={sessions} now={now} />
        ) : null}

        <Card aria-labelledby="h-my">
          <CardHead
            title={
              <>
                کارهای من
                {open.length ? (
                  <Count value={open.length} label={`${faNumber(open.length)} کار باز`} />
                ) : null}
              </>
            }
            titleId="h-my"
            icon="tasks"
            link={{ href: '/my/tasks', label: 'همه' }}
          />
          {open.length ? (
            <ul className="-mx-4 md:-mx-5">
              {open.slice(0, HOME_TASKS).map((t) => (
                <StudentTaskItem key={t.id} task={t} now={now} />
              ))}
            </ul>
          ) : (
            <EmptyState icon="check-circle" tone="ok" title="کار بازی نداری" className="py-5">
              وقتی مشاورت کار تازه‌ای بخواهد، همین‌جا می‌آید.
            </EmptyState>
          )}
        </Card>

        {/* slot: tools (1.0) — nothing in 0.1, not even "Coming soon" (design-system §9). */}
        <Card aria-labelledby="h-q">
          <CardHead
            title={
              <>
                سؤال‌های من
                {newReplies ? (
                  <Count
                    value={newReplies}
                    tone="brand"
                    label={`${faNumber(newReplies)} پاسخ جدید`}
                  />
                ) : null}
              </>
            }
            titleId="h-q"
            icon="chat"
            actions={
              <Link
                href="/my/questions/new"
                className={buttonClass({ size: 'sm', variant: 'soft' })}
              >
                <Icon name="plus" size={16} />
                سؤال جدید
              </Link>
            }
          />
          {recentQuestions.length ? (
            <>
              <StudentQuestionRows
                items={recentQuestions}
                expectedResponseText={questions.expectedResponseText}
                now={now}
              />
              {questions.items.length > recentQuestions.length ? (
                <Link
                  href="/my/questions"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
                >
                  {`همه‌ی سؤال‌ها (${faNumber(questions.items.length)})`}
                  <Icon name="chev-next" size={14} />
                </Link>
              ) : null}
            </>
          ) : (
            <EmptyState icon="chat" tone="brand" title="سؤالی نپرسیده‌ای" className="py-5">
              {`هر جا گیر کردی بپرس؛ ${questions.expectedResponseText} جواب می‌گیری.`}
            </EmptyState>
          )}
        </Card>

        <Card aria-labelledby="h-n">
          <CardHead title="از مشاورت" titleId="h-n" icon="chat" />
          {notes.items.length ? (
            <ol className="relative mt-1 before:absolute before:start-[13px] before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
              {notes.items.map((n) => (
                <li key={n.id} className="relative ps-11 pb-5 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="absolute start-0 top-0 grid size-7 place-items-center rounded-full border border-primary-line bg-primary-weak-2 text-primary-text"
                  >
                    <Icon name="chat" size={14} />
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-fg-3">
                    <strong className="font-semibold text-fg">{n.author.displayName}</strong>
                    <span>{`${noteKindLabel[n.kind]} · ${faDayTime(new Date(n.occurredAt), now)}`}</span>
                  </div>
                  <p
                    dir="auto"
                    className="mt-1.5 rounded-md border border-primary-line bg-primary-weak px-4 py-3 text-ui leading-6 whitespace-pre-line [overflow-wrap:anywhere]"
                  >
                    {n.body}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon="chat" title="هنوز یادداشتی نیست" className="py-5">
              خلاصه‌ی جلسه‌ها و نکته‌هایی که مشاورت برایت می‌نویسد این‌جا می‌آید.
            </EmptyState>
          )}
        </Card>

        <Card aria-labelledby="h-ms">
          <CardHead
            title="نقاط عطف"
            titleId="h-ms"
            icon="award"
            actions={
              milestones.length ? (
                <Link
                  href="/my/milestones/new"
                  className={buttonClass({ size: 'sm', variant: 'ghost' })}
                >
                  <Icon name="plus" size={16} />
                  ثبت خبر خوب
                </Link>
              ) : undefined
            }
          />
          {milestones.length ? (
            <ul className="-mx-4 md:-mx-5">
              {milestones.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 md:px-5"
                >
                  <span
                    aria-hidden="true"
                    className={
                      m.status === 'approved'
                        ? 'mt-0.5 grid size-7 flex-none place-items-center rounded-full bg-h-green-bg text-h-green-fg'
                        : 'mt-0.5 grid size-7 flex-none place-items-center rounded-full bg-primary-weak-2 text-primary-text'
                    }
                  >
                    <Icon name={m.status === 'approved' ? 'check' : 'hourglass'} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{m.type.name}</p>
                    <p className="mt-[3px] flex flex-wrap items-center gap-2 text-sm text-fg-2">
                      {m.status === 'proposed' ? (
                        <Tag variant="outline">منتظر تأیید مشاور</Tag>
                      ) : null}
                      <span>{formatJalaliLong(m.occurredOn)}</span>
                      {m.platform ? <bdi>{m.platform.name}</bdi> : null}
                      {moneyText(m.amount, m.currency) ? (
                        <span>{moneyText(m.amount, m.currency)}</span>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="grid size-12 flex-none place-items-center rounded-[14px] bg-primary-weak-2 text-primary-text"
              >
                <Icon name="award" />
              </span>
              <div>
                <p className="mb-2 text-sm text-fg-2">
                  هنوز نقطه‌ی عطفی ثبت نشده. اولین پاسخ کارفرما یا اولین قرارداد را این‌جا ثبت کن تا
                  مشاورت تأیید کند.
                </p>
                <Link href="/my/milestones/new" className={buttonClass({ size: 'sm' })}>
                  <Icon name="plus" size={16} />
                  ثبت خبر خوب
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
