import type { Metadata } from 'next';
import Link from 'next/link';
import { faNumber } from '@/components/format/fa';
import { ReminderButton } from '@/components/reminders/reminder-form';
import { ReminderList } from '@/components/reminders/reminder-list';
import { MentorFilter } from '@/components/stages/mentor-filter';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHead } from '@/components/ui/page-head';
import { listMentors } from '@/modules/identity/service';
import { listRemindersQuery } from '@/modules/reminders/contracts';
import { listReminders } from '@/modules/reminders/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { param } from '../_data';

export const metadata: Metadata = { title: 'یادآورهای من' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  { key: 'today', label: 'امروز و گذشته' },
  { key: 'upcoming', label: 'آینده' },
  { key: 'done', label: 'انجام‌شده' },
] as const;

/**
 * M9 «یادآورهای من» (sitemap §3): today and past, upcoming and done. An admin can look at a
 * mentor's reminders (`ownerId`). `?new=1` (quick-add «+») opens the reminder sheet.
 */
export default async function RemindersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const isAdmin = user.role === 'admin';
  const sp = await searchParams;
  const scope = TABS.find((t) => t.key === param(sp.scope))?.key ?? 'today';
  const owner = isAdmin ? param(sp.owner) : '';
  const parsed = listRemindersQuery.safeParse({ scope, ...(owner ? { ownerId: owner } : {}) });
  const [list, today, mentors] = await Promise.all([
    listReminders(actor, parsed.success ? parsed.data : { scope }),
    scope === 'today'
      ? Promise.resolve(null)
      : listReminders(actor, {
          scope: 'today',
          ...(parsed.success && parsed.data.ownerId ? { ownerId: parsed.data.ownerId } : {}),
        }),
    isAdmin ? listMentors(actor) : Promise.resolve([]),
  ]);
  const todayCount = (today ?? list).length;
  const owners = mentors.map((m) => ({ id: m.id, label: m.displayName }));
  const href = (key: string) => {
    const next = new URLSearchParams();
    if (key !== 'today') next.set('scope', key);
    if (owner) next.set('owner', owner);
    const s = next.toString();
    return s ? `/reminders?${s}` : '/reminders';
  };

  return (
    <>
      <PageHead
        title="یادآورهای من"
        sub={`${faNumber(todayCount)} یادآور برای امروز`}
        actions={
          <>
            {isAdmin ? (
              <MentorFilter
                param="owner"
                allowNone={false}
                value={parsed.success ? owner : ''}
                mentors={mentors.map((m) => ({
                  id: m.id,
                  label: m.id === user.id ? 'خودم' : m.displayName,
                }))}
              />
            ) : null}
            <ReminderButton
              owners={owners}
              viewerId={user.id}
              label="یادآور تازه"
              variant="primary"
              initiallyOpen={param(sp.new) === '1'}
            />
          </>
        }
      />
      <nav
        aria-label="دسته‌ی یادآورها"
        className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0"
      >
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={t.key === scope ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex min-h-tap items-center whitespace-nowrap border-b-2 px-3 text-ui',
              t.key === scope
                ? 'border-primary font-bold text-fg'
                : 'border-transparent font-medium text-fg-2 hover:text-fg',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Card>
        <ReminderList
          reminders={list}
          viewerId={user.id}
          showOwner={isAdmin}
          readOnly={scope === 'done'}
          emptyText={
            scope === 'today'
              ? 'برای امروز یادآوری نداری.'
              : scope === 'upcoming'
                ? 'یادآور آینده‌ای نداری.'
                : 'هنوز یادآوری انجام نشده است.'
          }
        />
      </Card>
    </>
  );
}
