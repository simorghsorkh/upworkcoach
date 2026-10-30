'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useFormat } from '@/components/format/use-format';
import { Icon } from '@/components/icons/icon';
import { Tag, type TagVariant } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import type { SessionDTO } from '@/modules/mentoring/contracts';
import type { SessionStatus } from '@/modules/mentoring/schema';
import type { PackageUsageDTO } from '@/modules/programs/contracts';

const STATUS_TAG: Record<SessionStatus, TagVariant> = {
  scheduled: 'gate',
  held: 'neutral',
  cancelled: 'outline',
  no_show: 'late',
};

export function SessionStatusTag({ status }: { status: SessionStatus }) {
  const t = useTranslations('mentoring.status');
  return (
    <Tag variant={STATUS_TAG[status]} icon={status === 'held' ? 'check' : null}>
      {t(status)}
    </Tag>
  );
}

/** "5 of 8 sessions · 12 days until the quota expires" (ADR-0012 §4); nothing for a run without a quota. */
export function UsageLine({ usage, className }: { usage: PackageUsageDTO; className?: string }) {
  const t = useTranslations('mentoring.usage');
  if (usage.quota === null && usage.daysLeft === null) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <Icon name="calendar" size={14} className="text-fg-3" />
      {usage.quota !== null ? (
        <span className={usage.overQuota ? 'font-semibold text-h-red-fg' : undefined}>
          {t('value', { used: usage.used, quota: usage.quota })}
        </span>
      ) : null}
      {usage.overQuota ? <Tag variant="overdue">{t('overQuota')}</Tag> : null}
      {usage.expired ? (
        <Tag variant="overdue" icon="clock">
          {t('expired')}
        </Tag>
      ) : usage.daysLeft !== null ? (
        <span>· {t('daysLeft', { count: usage.daysLeft })}</span>
      ) : null}
    </span>
  );
}

/** One session as a line: when, who, where and its state; `actions` holds staff buttons. */
export function SessionLine({
  session,
  now,
  showRun = false,
  showMentor = true,
  actions,
}: {
  session: SessionDTO;
  now: Date;
  showRun?: boolean;
  showMentor?: boolean;
  actions?: ReactNode;
}) {
  const t = useTranslations('mentoring');
  const format = useFormat();
  const at = new Date(session.scheduledAt);
  const soon =
    session.status === 'scheduled' &&
    at.getTime() - now.getTime() < 86_400_000 &&
    new Date(session.endsAt) > now;
  const link = session.location?.startsWith('https://') ? session.location : null;
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-fg">{format.dayTime(at, now)}</span>
          <span className="text-sm text-fg-3">
            {t('minutes', { count: session.durationMinutes })}
          </span>
          <SessionStatusTag status={session.status} />
          {soon ? <Tag variant="urgent">{t('within24h')}</Tag> : null}
          {!session.countsTowardQuota && session.status !== 'cancelled' ? (
            <Tag variant="outline" icon={null}>
              {t('notCounted')}
            </Tag>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
          {session.student ? (
            <bdi className="font-semibold text-fg">{session.student.displayName}</bdi>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Icon name="users" size={14} />
              {t('group')}
            </span>
          )}
          {showMentor ? <span>{t('withMentor', { name: session.mentor.displayName })}</span> : null}
          {showRun ? (
            <Link href={`/programs/runs/${session.run.id}`} className="text-link hover:underline">
              <bdi>{session.run.title}</bdi>
            </Link>
          ) : null}
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-link hover:underline"
            >
              <Icon name="video" size={14} />
              <bdi dir="ltr" className="max-w-56 truncate">
                {new URL(link).host}
              </bdi>
            </a>
          ) : session.location ? (
            <bdi>{session.location}</bdi>
          ) : null}
        </div>
        {session.status === 'cancelled' && session.cancelledReason ? (
          <p className="mt-0.5 text-sm text-fg-3">
            {t('cancelledBecause', { reason: session.cancelledReason })}
          </p>
        ) : null}
        {session.actions.length ? (
          <ul aria-label={t('actions')} className="mt-1.5 flex flex-col gap-1 text-sm">
            {session.actions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                <Icon name="next" size={14} className="text-fg-3" />
                <bdi className="font-medium">{a.title}</bdi>
                {session.student ? null : (
                  <span className="text-fg-3">· {a.student.displayName}</span>
                )}
                <span className="text-xs text-fg-3">
                  {t('actionDue', { date: format.date(new Date(a.dueAt)) })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-1.5">{actions}</div> : null}
    </div>
  );
}

/** Read-only list (today, my programs). */
export function SessionList({
  sessions,
  now,
  showRun,
  showMentor,
  empty,
}: {
  sessions: SessionDTO[];
  now: Date;
  showRun?: boolean;
  showMentor?: boolean;
  empty: ReactNode;
}) {
  if (!sessions.length) return <p className="text-sm text-fg-3">{empty}</p>;
  return (
    <ul className="-mx-4 md:-mx-5">
      {sessions.map((s) => (
        <li key={s.id} className="border-t border-line px-4 py-3 first:border-t-0 md:px-5">
          <SessionLine session={s} now={now} showRun={showRun} showMentor={showMentor} />
        </li>
      ))}
    </ul>
  );
}
