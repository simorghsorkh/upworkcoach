'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/icon';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { Avatar } from '@/components/ui/avatar';
import { Count } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { BrandMark } from './brand';
import { isActive, type NavCounts, studentNav, studentTabbar } from './nav-items';
import { type ShellUser, TabLink, tabbarClass } from './staff-chrome';

type ChromeProps = { user: ShellUser; counts?: NavCounts; activeHref?: string };

function useActive(activeHref?: string) {
  const pathname = usePathname();
  return (href: string) => (activeHref ? activeHref === href : isActive(pathname, href));
}

export function StudentTopbar({ user, counts, activeHref }: ChromeProps) {
  const active = useActive(activeHref);
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/88 backdrop-blur-[10px] backdrop-saturate-[1.4]">
      <div className="mx-auto flex h-topbar max-w-student-bar items-center gap-2 px-4 md:h-16 md:gap-6 md:px-6">
        <Link href="/home" className="flex items-center gap-2 font-extrabold text-fg">
          <BrandMark size="sm" />
          UpworkCoach
        </Link>
        <nav aria-label={t('mainNav')} className="ms-4 hidden gap-1 md:flex">
          {studentNav.map((item) => {
            const on = active(item.href);
            const count = counts?.[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'relative inline-flex min-h-btn items-center gap-2 rounded-full px-3 text-ui',
                  on
                    ? 'bg-primary-weak-2 font-bold text-primary-text'
                    : 'font-medium text-fg-2 hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon name={item.icon} size={16} />
                {tNav(item.label)}
                {count ? (
                  <Count value={count.value} label={count.label} tone="brand" small />
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <NotificationBell
            href="/my/notifications"
            unread={counts?.['/my/notifications']?.value ?? 0}
            current={active('/my/notifications')}
          />
          <Link
            href="/account"
            aria-label={t('accountOf', { name: user.displayName })}
            aria-current={active('/account') ? 'page' : undefined}
            className="inline-grid size-tap place-items-center rounded-full hover:bg-surface-2 md:size-10"
          >
            <Avatar id={user.id} name={user.displayName} size="sm" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function StudentTabbar({ counts, activeHref }: ChromeProps) {
  const active = useActive(activeHref);
  const t = useTranslations('shell');
  return (
    <nav aria-label={t('bottomNav')} className={tabbarClass}>
      {studentTabbar.map((item) => (
        <TabLink
          key={item.href}
          item={item}
          active={active(item.href)}
          count={counts?.[item.href]}
        />
      ))}
    </nav>
  );
}
