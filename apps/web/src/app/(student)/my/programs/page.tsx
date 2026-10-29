import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Icon } from '@/components/icons/icon';
import { GoalList } from '@/components/mentoring/goals-card';
import { SessionList, UsageLine } from '@/components/mentoring/session-bits';
import { ActivityMark } from '@/components/programs/activity-mark';
import { ProgressMeter } from '@/components/programs/progress-meter';
import { ContentLinks } from '@/components/student/path-card';
import { chipStatus, taskLabels } from '@/components/tasks/labels';
import { Tag, TaskStatusChip } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHead } from '@/components/ui/page-head';
import { Alert, EmptyState } from '@/components/ui/states';
import type { Locale } from '@/i18n/config';
import { listMyGoals, listSessions } from '@/modules/mentoring/service';
import type { ProgressDTO } from '@/modules/programs/contracts';
import { getMyPrograms } from '@/modules/programs/service';
import { requireUser, toActor } from '@/server/auth/current-user';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('myPrograms') };
}

/**
 * Mentee: the programs they are enrolled in (ADR-0012), each as its phases — passed, current
 * (with its activities) and locked (title only), the same reading as «my path». Sprint 5: the
 * program progress, a done mark on each activity, their own marks on lessons, resources and
 * checklists, and the task of an assignment once the mentor has assigned it. Sprint 5b: their
 * upcoming sessions, the package use and, for one-on-one mentoring, the goals.
 */
export default async function MyProgramsPage() {
  const user = await requireUser(['student']);
  const actor = toActor(user);
  const now = new Date();
  const [t, tm, programs, locale, sessions, goals, ts] = await Promise.all([
    getTranslations('programs'),
    getTranslations('mentoring'),
    getMyPrograms(actor),
    getLocale(),
    listSessions(actor, { when: 'upcoming' }, now),
    listMyGoals(actor),
    getTranslations('scheduling.mentee'),
  ]);
  const taskText = taskLabels(locale as Locale);
  const progressText = (p: ProgressDTO) =>
    p.percent === null
      ? t('progress.unknown')
      : t('progress.value', { percent: p.percent, done: p.done, total: p.total });

  return (
    <>
      <PageHead
        title={t('my.title')}
        sub={t('my.sub')}
        actions={
          <ButtonLink href="/my/mentors" variant="soft">
            <Icon name="calendar" size={16} />
            {ts('bookCta')}
          </ButtonLink>
        }
      />
      {sessions.length ? (
        <Card aria-labelledby="h-my-sessions" className="mb-4 md:mb-5">
          <CardHead
            title={tm('today.title')}
            titleId="h-my-sessions"
            icon="calendar"
            count={sessions.length}
          />
          <SessionList sessions={sessions} now={now} empty={tm('noneUpcoming')} />
        </Card>
      ) : null}
      {programs.length === 0 ? (
        <Card>
          <EmptyState icon="flag" tone="brand" title={t('my.empty')} headingLevel={2}>
            {t('my.emptyBody')}
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 md:gap-5">
          {programs.map((program) => (
            <Card key={program.enrollmentId} aria-labelledby={`h-${program.enrollmentId}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 id={`h-${program.enrollmentId}`} className="min-w-0 flex-1 text-h2">
                  <bdi>{program.run.title}</bdi>
                </h2>
                <Tag>{t(`kind.${program.run.kind}`)}</Tag>
              </div>
              <ProgressMeter
                className="mb-3"
                percent={program.progress.percent}
                label={t('progress.label')}
                text={progressText(program.progress)}
              />
              {program.usage.quota !== null ? (
                <p className="mb-3 text-sm text-fg-2">
                  <span className="sr-only">{tm('usage.label')}: </span>
                  <UsageLine usage={program.usage} />
                </p>
              ) : null}
              {program.run.kind === 'one_on_one' ? (
                <section aria-label={tm('goals.title')} className="mb-3">
                  <h3 className="mb-1.5 text-sm font-semibold text-fg-2">{tm('goals.title')}</h3>
                  <GoalList goals={goals.filter((g) => g.enrollmentId === program.enrollmentId)} />
                </section>
              ) : null}
              {program.status === 'paused' ? (
                <Alert tone="warn" className="mb-3">
                  {t('my.paused')}
                </Alert>
              ) : null}
              {program.status === 'completed' ? (
                <Alert tone="ok" className="mb-3">
                  {t('my.completed')}
                </Alert>
              ) : null}
              <ol className="-mx-4 md:-mx-5">
                {program.phases.map((phase, index) => (
                  <li
                    key={phase.id}
                    className={cn(
                      'border-t border-line px-4 py-3 first:border-t-0 md:px-5',
                      phase.state === 'current' && 'bg-primary-weak',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'grid size-8 flex-none place-items-center rounded-full border-2 text-sm font-bold',
                          phase.state === 'passed' && 'border-primary bg-primary text-white',
                          phase.state === 'current' &&
                            'border-primary bg-surface text-primary-text',
                          phase.state === 'locked' && 'border-line-2 text-fg-3',
                        )}
                      >
                        {phase.state === 'passed' ? <Icon name="check" size={16} /> : index + 1}
                      </span>
                      <bdi className="min-w-0 flex-1 font-semibold">{phase.title}</bdi>
                      <span className="text-xs text-fg-3">{t(`my.state.${phase.state}`)}</span>
                    </div>
                    {phase.state !== 'locked' && phase.body ? (
                      <p className="ms-11 mt-1 text-sm whitespace-pre-line text-fg-2">
                        {phase.body}
                      </p>
                    ) : null}
                    {phase.state !== 'locked' && phase.contentLinks.length ? (
                      <div className="ms-11">
                        <ContentLinks links={phase.contentLinks} />
                      </div>
                    ) : null}
                    {phase.activities.length ? (
                      <ul className="ms-11 mt-2 flex flex-col gap-2">
                        {phase.activities.map((a) => {
                          const markable =
                            a.canMark &&
                            phase.state !== 'locked' &&
                            (program.status === 'active' || program.status === 'paused');
                          return (
                            <li key={a.id} className="rounded-sm border border-line bg-surface p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                {a.done ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-h-green-fg">
                                    <Icon name="check-circle" size={16} />
                                    {t('my.done')}
                                  </span>
                                ) : null}
                                <Tag variant="outline" icon={null}>
                                  {t(`nodeType.${a.nodeType}`)}
                                </Tag>
                                <bdi className="font-semibold">{a.title}</bdi>
                                {a.isRequired ? null : (
                                  <span className="text-xs text-fg-3">{t('my.optional')}</span>
                                )}
                              </div>
                              {a.body ? (
                                <p className="mt-1 text-sm whitespace-pre-line text-fg-2">
                                  {a.body}
                                </p>
                              ) : null}
                              {a.checklistItems.length && !markable ? (
                                <ul
                                  aria-label={t('my.items')}
                                  className="mt-1 list-inside list-disc text-sm text-fg-2"
                                >
                                  {a.checklistItems.map((item, i) => (
                                    <li
                                      // biome-ignore lint/suspicious/noArrayIndexKey: items keep their position
                                      key={i}
                                      className={a.checklistState[i] ? 'line-through' : undefined}
                                    >
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                              {a.contentLinks.length ? (
                                <ContentLinks links={a.contentLinks} />
                              ) : null}
                              {markable ? (
                                <ActivityMark
                                  enrollmentId={program.enrollmentId}
                                  nodeId={a.id}
                                  done={a.done}
                                  items={a.checklistItems}
                                  checklistState={a.checklistState}
                                />
                              ) : null}
                              {a.nodeType === 'assignment' && phase.state !== 'locked' ? (
                                a.task ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <TaskStatusChip status={chipStatus[a.task.status]}>
                                      {taskText.studentStatus[a.task.status]}
                                    </TaskStatusChip>
                                    <Link
                                      href={`/my/tasks/${a.task.id}`}
                                      className="text-sm font-semibold text-link hover:underline"
                                    >
                                      {t('my.openTask')}
                                    </Link>
                                  </div>
                                ) : (
                                  <p className="mt-2 text-xs text-fg-3">{t('my.notAssigned')}</p>
                                )
                              ) : null}
                              {a.nodeType === 'milestone' && !a.done && phase.state !== 'locked' ? (
                                <p className="mt-2 text-xs text-fg-3">{t('my.milestoneHint')}</p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
