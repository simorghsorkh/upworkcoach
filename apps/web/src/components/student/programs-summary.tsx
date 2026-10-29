'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/components/format/use-format';
import { UsageLine } from '@/components/mentoring/session-bits';
import { ProgressMeter } from '@/components/programs/progress-meter';
import { Tag } from '@/components/ui/badge';
import { Card, CardHead } from '@/components/ui/card';
import type { SessionDTO } from '@/modules/mentoring/contracts';
import type { MyProgramDTO } from '@/modules/programs/contracts';

/**
 * Mentee home (Coach Office sprint 6b): one line per course or mentoring they are in — progress,
 * the current phase, package use and the next session; the details stay on «my programs».
 */
export function ProgramsSummary({
  programs,
  sessions,
  now,
}: {
  programs: MyProgramDTO[];
  sessions: SessionDTO[];
  now: Date;
}) {
  const t = useTranslations('studentHome');
  const tp = useTranslations('programs');
  const format = useFormat();
  return (
    <Card aria-labelledby="h-programs">
      <CardHead
        title={t('programs')}
        titleId="h-programs"
        icon="flag"
        link={{ href: '/my/programs', label: t('all') }}
      />
      <ul className="-mx-4 md:-mx-5">
        {programs.map((p) => {
          const current = p.phases.find((ph) => ph.state === 'current');
          const next = sessions.find((s) => s.run.id === p.run.id && s.status === 'scheduled');
          return (
            <li
              key={p.enrollmentId}
              className="border-t border-line px-4 py-3 first:border-t-0 md:px-5"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Link
                  href="/my/programs"
                  className="min-w-0 flex-1 font-semibold text-fg hover:underline"
                >
                  <bdi>{p.run.title}</bdi>
                </Link>
                <Tag>{tp(`kind.${p.run.kind}`)}</Tag>
              </div>
              <ProgressMeter
                className="mb-2"
                percent={p.progress.percent}
                label={tp('progress.label')}
                text={
                  p.progress.percent === null
                    ? tp('progress.unknown')
                    : tp('progress.value', {
                        percent: p.progress.percent,
                        done: p.progress.done,
                        total: p.progress.total,
                      })
                }
              />
              <div className="flex flex-col gap-1 text-sm text-fg-2">
                {current ? (
                  <p>{t('currentPhase', { title: current.title })}</p>
                ) : p.status === 'completed' ? (
                  <p>{tp('my.completed')}</p>
                ) : null}
                {next ? (
                  <p>{t('nextSession', { at: format.dayTime(new Date(next.scheduledAt), now) })}</p>
                ) : null}
                {p.usage.quota !== null || p.usage.daysLeft !== null ? (
                  <UsageLine usage={p.usage} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
