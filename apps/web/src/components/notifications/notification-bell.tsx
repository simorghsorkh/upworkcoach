'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/icon';
import { Count } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';

/** Inbox icon with the unread count (top bars; Coach Office sprint 6b). */
export function NotificationBell({
  href,
  unread,
  current,
  className,
}: {
  href: string;
  unread: number;
  current: boolean;
  className?: string;
}) {
  const t = useTranslations('notifications');
  return (
    <Link
      href={href}
      aria-label={unread ? `${t('bell')} — ${t('unread', { count: unread })}` : t('bell')}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'relative inline-grid size-tap place-items-center rounded-full text-fg-2 hover:bg-surface-2 hover:text-fg md:size-10',
        className,
      )}
    >
      <Icon name="inbox" />
      {unread ? (
        <Count
          value={unread}
          tone="alert"
          small
          className="pointer-events-none absolute -top-0.5 -end-0.5"
        />
      ) : null}
    </Link>
  );
}
