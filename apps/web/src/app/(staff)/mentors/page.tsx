import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CheckboxField } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { ButtonLink, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField, TextField } from '@/components/ui/field';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import { type MentorDirectoryQuery, mentorDirectoryQuery } from '@/modules/mentors/contracts';
import { listMentorDirectory } from '@/modules/mentors/service';
import { requireUser, toActor } from '@/server/auth/current-user';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('mentors') };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value || undefined;

/**
 * Mentor directory (Coach Office sprint 4): every staff member's card and workload, with
 * name/specialty search, a specialty filter and «taking new mentees». A plain GET form, so
 * a filtered view is a link.
 */
export default async function MentorsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const sp = await searchParams;
  const raw = { q: first(sp.q), specialty: first(sp.specialty), accepting: first(sp.accepting) };
  const parsed = mentorDirectoryQuery.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)),
  );
  const query: MentorDirectoryQuery = parsed.success ? parsed.data : {};
  const [t, directory] = await Promise.all([
    getTranslations('mentors'),
    listMentorDirectory(toActor(user), query),
  ]);
  const hasFilters = Boolean(query.q || query.specialty || query.accepting !== undefined);
  const canOpen = (id: string) => user.role === 'admin' || id === user.id;

  return (
    <>
      <PageHead title={t('title')} sub={t('sub')} />
      <Card className="mb-4 md:mb-5">
        <form method="get" className="flex flex-wrap items-end gap-x-4">
          <TextField
            label={t('search')}
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            maxLength={100}
            className="min-w-48 flex-1"
          />
          <SelectField
            label={t('specialty')}
            name="specialty"
            defaultValue={query.specialty ?? ''}
            className="min-w-44"
          >
            <option value="">{t('allSpecialties')}</option>
            {directory.specialties.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
          <CheckboxField
            label={t('acceptingOnly')}
            name="accepting"
            value="1"
            defaultChecked={query.accepting === true}
          />
          <div className="mb-5 flex gap-2">
            <button type="submit" className={buttonClass({ variant: 'secondary' })}>
              <Icon name="filter" size={16} />
              {t('apply')}
            </button>
            {hasFilters ? (
              <ButtonLink href="/mentors" variant="ghost">
                {t('clear')}
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Card>

      {directory.items.length === 0 ? (
        <Card>
          <EmptyState icon="briefcase" title={t('empty')}>
            {hasFilters ? t('emptyBody') : null}
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
          {directory.items.map((m) => (
            <li key={m.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 text-h2">
                    {canOpen(m.id) ? (
                      <Link href={`/mentors/${m.id}`} className="hover:text-link">
                        <bdi>{m.displayName}</bdi>
                      </Link>
                    ) : (
                      <bdi>{m.displayName}</bdi>
                    )}
                  </h2>
                  <span className="flex flex-wrap gap-1.5">
                    {m.atCapacity ? <Tag variant="late">{t('atCapacity')}</Tag> : null}
                    {!m.profile.acceptingStudents ? (
                      <Tag variant="outline">{t('notAccepting')}</Tag>
                    ) : null}
                  </span>
                </div>
                {m.profile.specialties.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {m.profile.specialties.map((s) => (
                      <li key={s}>
                        <Tag>
                          <bdi>{s}</bdi>
                        </Tag>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-fg-3">{t('noSpecialties')}</p>
                )}
                <p className="line-clamp-3 text-sm text-fg-2">
                  {m.profile.bio ? <bdi>{m.profile.bio}</bdi> : t('noBio')}
                </p>
                <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3 text-sm">
                  <div>
                    <dt className="sr-only">{t('studentsTitle')}</dt>
                    <dd className="flex items-center gap-1.5 font-semibold">
                      <Icon name="users" size={16} className="text-fg-3" />
                      {t('students', { count: m.counts.students })}
                    </dd>
                    <dd className="text-fg-3">
                      {t('split', { primary: m.counts.primary, secondary: m.counts.secondary })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-3">{t('capacityLabel')}</dt>
                    <dd className="font-semibold">
                      {m.profile.capacity === null
                        ? t('noCapacity')
                        : t('capacity', { used: m.counts.primary, capacity: m.profile.capacity })}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t('runsTitle')}</dt>
                    <dd className="flex items-center gap-1.5">
                      <Icon name="flag" size={16} className="text-fg-3" />
                      {t('runs', { count: m.counts.runs })}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t('overdue', { count: m.counts.overdueReviews })}</dt>
                    <dd
                      className={
                        m.counts.overdueReviews
                          ? 'flex items-center gap-1.5 font-semibold text-h-red-fg'
                          : 'flex items-center gap-1.5 text-fg-3'
                      }
                    >
                      <Icon name="clock" size={16} />
                      {m.counts.overdueReviews
                        ? t('overdue', { count: m.counts.overdueReviews })
                        : t('noOverdue')}
                    </dd>
                  </div>
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
