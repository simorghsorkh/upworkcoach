import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/icons/icon';
import { EditProfileButton, TransferButton } from '@/components/mentors/mentor-dialogs';
import { Tag } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import { getFormat } from '@/i18n/server-format';
import { getMentor, listMentorDirectory } from '@/modules/mentors/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('mentor') };
}

/**
 * One mentor (Coach Office sprint 4): their card, the mentees they are primary or secondary
 * mentor of, and the runs they staff. The admin and the mentor themselves edit the card;
 * only the admin moves every mentee to someone else.
 */
export default async function MentorPage({ params }: { params: Params }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const { id } = await params;
  let mentor: Awaited<ReturnType<typeof getMentor>>;
  try {
    mentor = await getMentor(actor, id);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) notFound();
    throw err;
  }
  const [t, tp, tr, format, others, tn] = await Promise.all([
    getTranslations('mentors'),
    getTranslations('programs'),
    getTranslations('mentors.mentorRole'),
    getFormat(),
    mentor.canTransfer
      ? listMentorDirectory(actor).then((d) =>
          d.items
            .filter((m) => m.id !== mentor.id)
            .map((m) => ({ id: m.id, displayName: m.displayName })),
        )
      : Promise.resolve([]),
    getTranslations('nav'),
  ]);
  const live = mentor.students.filter(
    (s) => s.enrollmentStatus === 'active' || s.enrollmentStatus === 'paused',
  );

  return (
    <>
      <PageHead
        eyebrow={
          <Link href="/mentors" className="hover:text-link">
            {t('title')}
          </Link>
        }
        title={<bdi>{mentor.displayName}</bdi>}
        sub={
          <>
            <span>{t('activeMentees', { count: mentor.counts.students })}</span>
            <span aria-hidden="true">·</span>
            <span>
              {t('split', { primary: mentor.counts.primary, secondary: mentor.counts.secondary })}
            </span>
            {mentor.atCapacity ? <Tag variant="late">{t('atCapacity')}</Tag> : null}
            {!mentor.profile.acceptingStudents ? (
              <Tag variant="outline">{t('notAccepting')}</Tag>
            ) : null}
          </>
        }
        actions={
          <>
            {mentor.canEdit ? (
              <EditProfileButton mentorId={mentor.id} profile={mentor.profile} />
            ) : null}
            {mentor.canEdit ? (
              <ButtonLink
                href={actor.role === 'admin' ? `/calendar?mentor=${mentor.id}` : '/calendar'}
                variant="secondary"
              >
                <Icon name="calendar" size={16} />
                {tn('calendar')}
              </ButtonLink>
            ) : null}
            {mentor.canTransfer && mentor.counts.primary > 0 ? (
              <TransferButton
                mentorId={mentor.id}
                mentorName={mentor.displayName}
                others={others}
              />
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 md:gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card aria-labelledby="h-mentees">
            <CardHead
              title={t('studentsTitle')}
              titleId="h-mentees"
              icon="users"
              count={live.length}
            />
            {mentor.students.length === 0 ? (
              <EmptyState icon="users" title={t('noStudents')} />
            ) : (
              <ul className="-mx-4 md:-mx-5">
                {mentor.students.map((s) => {
                  const ended = s.enrollmentStatus !== 'active' && s.enrollmentStatus !== 'paused';
                  return (
                    <li
                      key={`${s.enrollmentId}-${s.role}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover md:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/students/${s.student.id}`}
                          className="block leading-6 font-semibold text-fg hover:text-link"
                        >
                          <bdi>{s.student.displayName}</bdi>
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-fg-2">
                          <Link href={`/programs/runs/${s.run.id}`} className="hover:text-link">
                            <bdi>{s.run.isLegacy ? tp('legacy') : s.run.title}</bdi>
                          </Link>
                          <span aria-hidden="true">·</span>
                          <span>{t('since', { date: format.date(new Date(s.since)) })}</span>
                        </div>
                      </div>
                      <span className="flex flex-wrap gap-1.5">
                        <Tag icon={s.role === 'primary' ? 'user' : 'users'}>{tr(s.role)}</Tag>
                        {ended ? (
                          <Tag variant="outline">
                            {tp(`enrollmentStatus.${s.enrollmentStatus}`)}
                          </Tag>
                        ) : s.enrollmentStatus === 'paused' ? (
                          <Tag variant="outline">{tp('enrollmentStatus.paused')}</Tag>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card aria-labelledby="h-card">
            <CardHead title={t('card')} titleId="h-card" icon="briefcase" />
            {mentor.profile.specialties.length ? (
              <ul className="mb-3 flex flex-wrap gap-1.5">
                {mentor.profile.specialties.map((s) => (
                  <li key={s}>
                    <Tag>
                      <bdi>{s}</bdi>
                    </Tag>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-fg-3">{t('noSpecialties')}</p>
            )}
            <p className="mb-3 text-sm whitespace-pre-line text-fg-2">
              {mentor.profile.bio ? <bdi>{mentor.profile.bio}</bdi> : t('noBio')}
            </p>
            <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
              <div>
                <dt className="text-fg-3">{t('capacityLabel')}</dt>
                <dd className="font-semibold">
                  {mentor.profile.capacity === null
                    ? t('noCapacity')
                    : t('capacity', {
                        used: mentor.counts.primary,
                        capacity: mentor.profile.capacity,
                      })}
                </dd>
              </div>
              <div>
                <dt className="sr-only">{t('overdue', { count: mentor.counts.overdueReviews })}</dt>
                <dd
                  className={
                    mentor.counts.overdueReviews
                      ? 'flex items-center gap-1.5 font-semibold text-h-red-fg'
                      : 'flex items-center gap-1.5 text-fg-3'
                  }
                >
                  <Icon name="clock" size={16} />
                  {mentor.counts.overdueReviews
                    ? t('overdue', { count: mentor.counts.overdueReviews })
                    : t('noOverdue')}
                </dd>
              </div>
            </dl>
          </Card>

          <Card aria-labelledby="h-mruns">
            <CardHead
              title={t('runsTitle')}
              titleId="h-mruns"
              icon="flag"
              count={mentor.runs.length}
            />
            {mentor.runs.length === 0 ? (
              <EmptyState icon="flag" title={t('noRuns')} />
            ) : (
              <ul className="-mx-4 md:-mx-5">
                {mentor.runs.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 border-t border-line px-4 py-2.5 first:border-t-0 md:px-5"
                  >
                    <Link
                      href={`/programs/runs/${r.id}`}
                      className="min-w-0 flex-1 font-semibold text-fg hover:text-link"
                    >
                      <bdi>{r.title}</bdi>
                    </Link>
                    <span className="text-sm text-fg-3">{tp(`staffRole.${r.role}`)}</span>
                    <span className="inline-flex items-center gap-1 text-sm text-fg-2">
                      <Icon name="users" size={14} />
                      {r.activeCount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
