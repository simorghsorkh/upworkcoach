import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Icon } from '@/components/icons/icon';
import { RunStatusTag, TemplateStatusTags } from '@/components/programs/program-bits';
import { NewRunButton, NewTemplateButton } from '@/components/programs/program-dialogs';
import { dayDate, isolate } from '@/components/programs/program-text';
import { Tag } from '@/components/ui/badge';
import { Card, CardHead } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import { getFormat } from '@/i18n/server-format';
import { getStaffSettings } from '@/modules/catalog/service';
import { listRuns, listTemplates } from '@/modules/programs/service';
import { requireUser, toActor } from '@/server/auth/current-user';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('programs') };
}

/**
 * Coach Office programs (ADR-0012): runs first (what is happening), then the templates they
 * are made from. Mentors see runs they staff or that hold their mentees, organization
 * templates and their own.
 */
export default async function ProgramsPage() {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const isAdmin = user.role === 'admin';
  const [t, format, locale, runs, templates, settings] = await Promise.all([
    getTranslations('programs'),
    getFormat(),
    getLocale(),
    listRuns(actor),
    listTemplates(actor),
    getStaffSettings(actor).catch(() => null),
  ]);
  const canGroup = isAdmin || (settings?.access.mentorsCanCreateGroupRuns ?? false);
  const runnable = templates
    .filter(
      (tpl) =>
        tpl.status === 'published' &&
        (tpl.visibility === 'organization' || tpl.owner?.id === user.id),
    )
    .map((tpl) => ({ id: tpl.id, title: tpl.title, kind: tpl.kind }));
  const names = new Intl.ListFormat(locale, { type: 'unit' });
  const liveRuns = runs.filter((r) => r.status !== 'archived');
  const shownTemplates = templates.filter((tpl) => tpl.status !== 'archived');

  return (
    <>
      <PageHead
        title={t('title')}
        sub={t('sub')}
        actions={
          <>
            <NewTemplateButton isAdmin={isAdmin} />
            <NewRunButton isAdmin={isAdmin} canGroup={canGroup} templates={runnable} />
          </>
        }
      />
      <div className="flex flex-col gap-4 md:gap-5">
        <Card aria-labelledby="h-runs">
          <CardHead title={t('runs')} titleId="h-runs" icon="flag" count={liveRuns.length} />
          {liveRuns.length === 0 ? (
            <EmptyState icon="flag" tone="brand" title={t('noRuns')}>
              {t('noRunsBody')}
            </EmptyState>
          ) : (
            <ul className="-mx-4 md:-mx-5">
              {liveRuns.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover md:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/programs/runs/${run.id}`}
                      className="block leading-6 font-semibold text-fg hover:text-link"
                    >
                      <bdi>{run.title}</bdi>
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
                      <span>
                        {run.template
                          ? t('fromTemplate', { title: isolate(run.template.title) })
                          : t('kind.one_on_one')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{t(`mode.${run.mode}`)}</span>
                      {run.startsOn ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{t('startsOn', { date: format.date(dayDate(run.startsOn)) })}</span>
                        </>
                      ) : null}
                      {run.staff.length ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{names.format(run.staff.map((s) => s.displayName))}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-sm text-fg-2">
                    <Icon name="users" size={16} />
                    {t('activeOf', { active: run.activeCount, total: run.totalCount })}
                  </span>
                  <span className="flex gap-1.5">
                    {run.isLegacy ? <Tag icon="route">{t('legacy')}</Tag> : null}
                    <RunStatusTag status={run.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="h-templates">
          <CardHead
            title={t('templates')}
            titleId="h-templates"
            icon="list"
            count={shownTemplates.length}
          />
          {shownTemplates.length === 0 ? (
            <EmptyState icon="list" tone="brand" title={t('noTemplates')}>
              {t('noTemplatesBody')}
            </EmptyState>
          ) : (
            <ul className="-mx-4 md:-mx-5">
              {shownTemplates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover md:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/programs/templates/${tpl.id}`}
                      className="block leading-6 font-semibold text-fg hover:text-link"
                    >
                      <bdi>{tpl.title}</bdi>
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
                      <span>{t(`kind.${tpl.kind}`)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t('phaseCount', { count: tpl.phaseCount })}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t('activityCount', { count: tpl.activityCount })}</span>
                      {tpl.durationWeeks ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{t('weeks', { count: tpl.durationWeeks })}</span>
                        </>
                      ) : null}
                      <span aria-hidden="true">·</span>
                      <span>{t('runCount', { count: tpl.runCount })}</span>
                      {tpl.owner && tpl.owner.id !== user.id ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{t('owner', { name: isolate(tpl.owner.displayName) })}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    <TemplateStatusTags
                      status={tpl.status}
                      visibility={tpl.visibility}
                      isLegacy={tpl.isLegacy}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
