'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { apiGet, apiPost } from '@/components/api/client';
import { useFormat } from '@/components/format/use-format';
import { Icon, type IconName } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { NotificationDTO, NotificationListDTO } from '@/modules/notifications/contracts';

const ICON: Record<NotificationDTO['kind'], IconName> = {
  task_assigned: 'tasks',
  task_reviewed: 'check',
  task_submitted: 'upload',
  question_new: 'chat',
  question_reply: 'chat',
  session_scheduled: 'calendar',
  booking_requested: 'calendar',
  booking_decided: 'calendar',
  booking_cancelled: 'calendar',
};

/**
 * The caller's notices (Coach Office sprint 6b), newest first: opening one marks it read and
 * follows its link; "Mark all as read" clears the badge; older pages load on demand.
 */
export function NotificationList({ initial }: { initial: NotificationListDTO }) {
  const t = useTranslations('notifications');
  const format = useFormat();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [unread, setUnread] = useState(initial.unread);
  const [busy, setBusy] = useState<'all' | 'more' | null>(null);

  function text(n: NotificationDTO): string {
    const title = n.data.title ?? '';
    const student = n.student?.displayName ?? '';
    if (n.kind === 'task_reviewed') {
      return n.data.outcome === 'accepted'
        ? t('kind.task_reviewed_accepted', { title })
        : t('kind.task_reviewed_changes_requested', { title });
    }
    const when = n.data.at ? format.dayTime(new Date(n.data.at)) : '';
    if (n.kind === 'session_scheduled') return t('kind.session_scheduled', { when });
    if (n.kind === 'booking_decided') {
      return n.data.outcome === 'approved'
        ? t('kind.booking_decided_approved', { when })
        : t('kind.booking_decided_declined', { when });
    }
    if (n.kind === 'booking_requested' || n.kind === 'booking_cancelled') {
      return t(`kind.${n.kind}`, { student, when });
    }
    return t(`kind.${n.kind}`, { title, student });
  }

  async function open(n: NotificationDTO) {
    if (!n.read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      const res = await apiPost<{ unread: number }>('/api/v1/notifications/read', { ids: [n.id] });
      if (res.ok) setUnread(res.data.unread);
    }
    router.push(n.href);
    router.refresh();
  }

  async function markAll() {
    setBusy('all');
    const res = await apiPost<{ unread: number }>('/api/v1/notifications/read', {});
    setBusy(null);
    if (!res.ok) {
      toast.show({ message: res.error.message });
      return;
    }
    setUnread(res.data.unread);
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    router.refresh();
  }

  async function more() {
    if (!cursor) return;
    setBusy('more');
    const res = await apiGet<NotificationListDTO>(
      `/api/v1/notifications?cursor=${encodeURIComponent(cursor)}`,
    );
    setBusy(null);
    if (!res.ok) {
      toast.show({ message: t('failed') });
      return;
    }
    setItems((list) => [...list, ...res.data.items]);
    setCursor(res.data.nextCursor);
  }

  if (!items.length) {
    return (
      <EmptyState icon="inbox" title={t('emptyTitle')} headingLevel={2}>
        {t('emptyBody')}
      </EmptyState>
    );
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-2" role="status">
          {t('unread', { count: unread })}
        </p>
        {unread ? (
          <Button size="sm" variant="soft" loading={busy === 'all'} onClick={() => void markAll()}>
            <Icon name="check" size={14} />
            {t('markAll')}
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-sm border border-line">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => void open(n)}
              className={cn(
                'flex w-full cursor-pointer items-start gap-3 px-3 py-3 text-start hover:bg-surface-2',
                !n.read && 'bg-primary-weak',
              )}
            >
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-8 flex-none place-items-center rounded-full bg-surface-2 text-fg-2"
              >
                <Icon name={ICON[n.kind]} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-ui', !n.read && 'font-semibold')}>
                  <bdi>{text(n)}</bdi>
                </span>
                <span className="mt-0.5 block text-xs text-fg-3">
                  {format.dayTime(new Date(n.createdAt))}
                  {n.actor ? (
                    <>
                      {' · '}
                      <bdi>{n.actor.displayName}</bdi>
                    </>
                  ) : null}
                </span>
              </span>
              {!n.read ? (
                <span className="mt-1 flex-none rounded-full bg-primary px-2 py-0.5 text-2xs font-bold text-white">
                  {t('new')}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {cursor ? (
        <div className="mt-3 flex justify-center">
          <Button size="sm" loading={busy === 'more'} onClick={() => void more()}>
            {t('more')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
