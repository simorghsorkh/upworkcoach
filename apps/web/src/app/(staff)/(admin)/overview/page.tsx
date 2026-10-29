import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ProgressMeter } from '@/components/programs/progress-meter';
import { Tag } from '@/components/ui/badge';
import { Card, CardHead } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Kpi } from '@/components/ui/kpi';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import { getFormat } from '@/i18n/server-format';
import type { DashboardCourseDTO, DashboardMentorDTO } from '@/modules/dashboard/contracts';
import { getOrgDashboard } from '@/modules/dashboard/service';
import { requireUser, toActor } from '@/server/auth/current-user';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('overview') };
}

/**
 * Coach Office sprint 6 — the organization at a glance (admin): mentee health, work waiting on
 * the team (each tile jumps to its list), every open course and every mentor's load.
 */
export default async function OverviewPage() {
  const user = await requireUser(['admin']);
  const [t, data] = await Promise.all([
    getTranslations('orgDashboard'),
    getOrgDashboard(toActor(user)),
  ]);
  const { students: s, work: w } = data;
  return (
    <>
      <PageHead
        title={t('title')}
        sub={t('sub', {
          active: s.active,
          paused: s.paused,
          courses: data.courses.length,
          mentors: data.mentors.length,
        })}
      />
      <nav
        aria-label={t('summary')}
        className="mb-4 grid grid-cols-2 gap-2 md:mb-6 md:grid-cols-3 md:gap-4 xl:grid-cols-5"
      >
        <Kpi
          href="/students?health=red"
          icon="flag"
          tone="red"
          value={s.red}
          label={t('kpiRed')}
          sub={null}
        />
        <Kpi
          href="/students?health=yellow"
          icon="alert"
          tone="yellow"
          value={s.yellow}
          label={t('kpiYellow')}
          sub={null}
        />
        <Kpi
          href="/tasks?tab=review"
          icon="hourglass"
          tone="brand"
          value={w.reviews}
          label={t('kpiReviews')}
          sub={w.breachedReviews ? t('late', { count: w.breachedReviews }) : null}
        />
        <Kpi
          href="/questions"
          icon="chat"
          tone="plum"
          value={w.unansweredQuestions}
          label={t('kpiQuestions')}
          sub={w.breachedQuestions ? t('late', { count: w.breachedQuestions }) : null}
        />
        <Kpi
          href="/tasks?tab=overdue"
          icon="clock"
          tone="sky"
          value={w.overdueTasks}
          label={t('kpiOverdue')}
          sub={null}
        />
      </nav>
      <div className="flex flex-col gap-4 md:gap-5">
        <Courses courses={data.courses} />
        <Mentors mentors={data.mentors} />
      </div>
    </>
  );
}

const th = 'px-3 py-2 text-start text-xs font-semibold text-fg-3 whitespace-nowrap';
const td = 'px-3 py-2.5 align-middle';

function Table({
  caption,
  head,
  children,
}: {
  caption: string;
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2">
            {head.map((h) => (
              <th key={h} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

async function Count({ value, tone }: { value: number; tone: 'red' | 'yellow' | 'late' }) {
  const format = await getFormat();
  return (
    <span
      className={cn(
        'tabular-nums',
        value > 0 && tone === 'red' && 'font-bold text-h-red-fg',
        value > 0 && tone === 'yellow' && 'font-bold text-h-yellow-fg',
        value > 0 && tone === 'late' && 'font-bold text-h-red-fg',
        value === 0 && 'text-fg-3',
      )}
    >
      {format.number(value)}
    </span>
  );
}

async function Courses({ courses }: { courses: DashboardCourseDTO[] }) {
  const t = await getTranslations('orgDashboard');
  return (
    <Card>
      <CardHead title={t('courses')} sub={t('coursesHint')} />
      {courses.length === 0 ? (
        <EmptyState icon="flag" title={t('noCourses')} className="py-5" />
      ) : (
        <Table
          caption={t('courses')}
          head={[t('course'), t('members'), t('progress'), t('red'), t('yellow'), t('staff')]}
        >
          {courses.map((c) => (
            <tr key={c.id} className="border-b border-line last:border-b-0">
              <th scope="row" className={cn(td, 'text-start font-semibold')}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={c.isLegacy ? '/stages' : `/programs/runs/${c.id}`}
                    className="text-link hover:underline"
                  >
                    <bdi>{c.title}</bdi>
                  </Link>
                  {c.isLegacy ? <Tag>{t('mainPath')}</Tag> : null}
                  {c.mode === 'individual' ? <Tag>{t('individual')}</Tag> : null}
                  {c.status === 'draft' ? <Tag>{t('draft')}</Tag> : null}
                  {!c.isLegacy && c.mode === 'group' ? (
                    <Link
                      href={`/stages?run=${c.id}`}
                      className="text-xs font-medium text-fg-3 hover:text-link hover:underline"
                    >
                      {t('board')}
                    </Link>
                  ) : null}
                </div>
              </th>
              <td className={cn(td, 'whitespace-nowrap text-fg-2')}>
                {t('membersValue', { active: c.active, paused: c.paused })}
              </td>
              <td className={cn(td, 'min-w-36')}>
                {c.isLegacy ? (
                  <span className="text-fg-3">{t('progressNone')}</span>
                ) : (
                  <ProgressMeter
                    percent={c.averageProgress}
                    label={t('progress')}
                    text={
                      c.averageProgress === null
                        ? t('progressUnknown')
                        : t('percent', { value: c.averageProgress })
                    }
                  />
                )}
              </td>
              <td className={td}>
                <Count value={c.red} tone="red" />
              </td>
              <td className={td}>
                <Count value={c.yellow} tone="yellow" />
              </td>
              <td className={cn(td, 'text-fg-2')}>
                {c.staff.length ? (
                  <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {c.staff.map((name) => (
                      <li key={name}>
                        <bdi>{name}</bdi>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-fg-3">{t('noStaff')}</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

async function Mentors({ mentors }: { mentors: DashboardMentorDTO[] }) {
  const [t, format] = await Promise.all([getTranslations('orgDashboard'), getFormat()]);
  return (
    <Card>
      <CardHead title={t('mentors')} sub={t('mentorsHint')} />
      {mentors.length === 0 ? (
        <EmptyState icon="users" title={t('noMentors')} className="py-5" />
      ) : (
        <Table
          caption={t('mentors')}
          head={[
            t('mentor'),
            t('students'),
            t('primary'),
            t('runs'),
            t('overdueReviews'),
            t('red'),
          ]}
        >
          {mentors.map((m) => (
            <tr key={m.id} className="border-b border-line last:border-b-0">
              <th scope="row" className={cn(td, 'text-start font-semibold')}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/mentors/${m.id}`} className="text-link hover:underline">
                    <bdi>{m.displayName}</bdi>
                  </Link>
                  {m.role === 'admin' ? <Tag>{t('admin')}</Tag> : null}
                  {m.atCapacity ? (
                    <Tag variant="late" icon="alert">
                      {t('atCapacity')}
                    </Tag>
                  ) : null}
                </div>
              </th>
              <td className={cn(td, 'tabular-nums')}>{format.number(m.students)}</td>
              <td className={cn(td, 'whitespace-nowrap tabular-nums text-fg-2')}>
                {format.number(m.primary)}
                {' / '}
                {m.capacity === null ? t('noCapacity') : format.number(m.capacity)}
              </td>
              <td className={cn(td, 'tabular-nums')}>{format.number(m.runs)}</td>
              <td className={td}>
                <Count value={m.overdueReviews} tone="late" />
              </td>
              <td className={td}>
                <Count value={m.red} tone="red" />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
