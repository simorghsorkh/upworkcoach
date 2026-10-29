'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { logout } from '@/components/auth/logout';
import { useFormat } from '@/components/format/use-format';
import { Icon, type IconName } from '@/components/icons/icon';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { Avatar } from '@/components/ui/avatar';
import { Count } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/dialog';
import { BrandMark } from './brand';
import {
  adminNav,
  isActive,
  type NavCounts,
  type NavItem,
  staffNav,
  staffTabbarEnd,
  staffTabbarStart,
} from './nav-items';
import { useQuickAdd } from './quick-add';

export type ShellUser = { id: string; displayName: string; role: 'admin' | 'mentor' | 'student' };

type ChromeProps = {
  user: ShellUser;
  counts?: NavCounts;
  /** Force the highlighted item (dev preview); defaults to the current pathname. */
  activeHref?: string;
};

function useActive(activeHref?: string) {
  const pathname = usePathname();
  return (href: string) => (activeHref ? activeHref === href : isActive(pathname, href));
}

/* ---------------------------------------------------------------------------
   Desktop / tablet: dark ink sidebar (≥ 768px), first grid column = right in RTL.
   --------------------------------------------------------------------------- */
export function StaffSidebar({ user, counts, activeHref }: ChromeProps) {
  const active = useActive(activeHref);
  const t = useTranslations('shell');
  const tRole = useTranslations('role');
  const tNav = useTranslations('nav');
  const isAdmin = user.role === 'admin';
  return (
    <aside
      aria-label={t('mainNav')}
      className="sticky top-0 hidden h-dvh flex-col gap-1 overflow-y-auto bg-side-bg px-3 pt-5 pb-4 text-side-fg [scrollbar-width:thin] md:flex"
    >
      <Link href="/today" className="flex items-center gap-3 px-2 pb-5 text-inherit">
        <BrandMark />
        <span>
          <span className="block text-h2 leading-[22px] font-extrabold text-side-strong">
            UpworkCoach
          </span>
          <span className="block text-xs leading-4 font-medium text-side-fg-2">{t('tagline')}</span>
        </span>
      </Link>

      <Link
        href="/students"
        className="mb-4 flex min-h-btn items-center gap-2 rounded-sm border border-side-border bg-side-bg-2 px-3 text-sm text-side-fg-2 hover:border-side-count hover:text-side-fg focus-visible:outline-side-accent"
      >
        <Icon name="search" size={16} />
        {t('searchStudent')}
        <kbd className="ms-auto">/</kbd>
      </Link>

      <nav aria-label={t('sections')} className="flex flex-col gap-0.5">
        {staffNav.map((item) => (
          <SideLink
            key={item.href}
            item={item}
            active={active(item.href)}
            count={counts?.[item.href]}
          />
        ))}
        {isAdmin ? (
          <>
            <p className="px-3 pt-4 pb-1 text-2xs leading-4 font-semibold text-side-fg-2">
              {t('adminGroup')}
            </p>
            {adminNav.map((item) => (
              <SideLink key={item.href} item={item} active={active(item.href)} />
            ))}
          </>
        ) : null}
      </nav>

      <div className="mt-auto flex items-center gap-3 border-t border-side-border p-3 pt-4">
        <Avatar
          id={user.id}
          name={user.displayName}
          size="sm"
          className="ring-2 ring-side-border"
        />
        <div className="min-w-0 flex-1 leading-[18px]">
          <b className="block truncate text-ui font-semibold text-side-strong">
            {user.displayName}
          </b>
          <small className="text-xs text-side-fg-2">{tRole(user.role)}</small>
        </div>
        <Link
          href="/account"
          aria-label={tNav('account')}
          aria-current={active('/account') ? 'page' : undefined}
          className="inline-grid size-8 place-items-center rounded-sm text-side-fg-2 hover:bg-side-bg-2 hover:text-side-strong focus-visible:outline-side-accent"
        >
          <Icon name="user" />
        </Link>
      </div>
    </aside>
  );
}

function SideLink({
  item,
  active,
  count,
}: {
  item: NavItem;
  active: boolean;
  count?: NavCounts[string];
}) {
  const t = useTranslations('nav');
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex min-h-10 items-center gap-3 rounded-sm px-3 text-ui transition-colors duration-150 ease-out focus-visible:outline-side-accent',
        active
          ? 'bg-side-active font-bold text-side-strong before:absolute before:-start-3 before:top-[9px] before:bottom-[9px] before:w-[3px] before:rounded-[3px] before:bg-side-accent'
          : 'font-medium text-side-fg hover:bg-side-bg-2 hover:text-side-strong',
      )}
    >
      <Icon
        name={item.icon}
        className={active ? 'text-side-accent' : 'text-side-fg-2 group-hover:text-side-fg'}
      />
      {t(item.label)}
      {count ? (
        <Count
          value={count.value}
          label={count.label}
          tone={count.tone === 'alert' ? 'alert' : 'side'}
          className="ms-auto"
        />
      ) : null}
    </Link>
  );
}

/* ---------------------------------------------------------------------------
   Mobile (< 768px): top bar with menu and search; bottom bar with «+».
   --------------------------------------------------------------------------- */
const iconBtn =
  'inline-grid size-tap flex-none place-items-center rounded-sm text-fg-2 hover:bg-surface-2 hover:text-fg cursor-pointer';

export function StaffTopbar({ user, counts, activeHref }: ChromeProps) {
  const pathname = usePathname();
  const active = useActive(activeHref);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations('shell');
  const tNav = useTranslations('nav');
  const format = useFormat();
  const current = [...staffNav, ...adminNav].find((item) => active(item.href));
  const isToday = current?.href === '/today';
  const isAdmin = user.role === 'admin';
  const close = () => setMenuOpen(false);

  const menu: Array<NavItem & { sub?: string }> = [
    { href: '/stages', label: 'stagesKanban', icon: 'board' },
    { href: '/programs', label: 'programs', icon: 'flag' },
    { href: '/mentors', label: 'mentors', icon: 'briefcase' },
    { href: '/reminders', label: 'reminders', icon: 'bell' },
    ...(isAdmin
      ? [
          {
            href: '/overview',
            label: 'overview' as const,
            icon: 'grid' as IconName,
            sub: t('adminGroup'),
          },
          {
            href: '/results',
            label: 'results' as const,
            icon: 'chart' as IconName,
            sub: t('adminGroup'),
          },
          {
            href: '/settings',
            label: 'settings' as const,
            icon: 'sliders' as IconName,
            sub: t('adminGroup'),
          },
        ]
      : []),
    { href: '/account', label: 'account', icon: 'user' },
  ];

  return (
    <header className="sticky top-0 z-40 flex h-topbar items-center justify-between gap-2 border-b border-line bg-surface/90 px-2 backdrop-blur-[10px] backdrop-saturate-[1.4] md:hidden">
      <button
        type="button"
        className={iconBtn}
        aria-label={t('menu')}
        aria-haspopup="dialog"
        onClick={() => setMenuOpen(true)}
      >
        <Icon name="menu" />
      </button>
      <span className="flex-1 truncate text-center text-h2 font-bold">
        {current ? tNav(current.label) : pathname === '/account' ? tNav('account') : 'UpworkCoach'}
        {isToday ? (
          <small className="text-sm font-medium text-fg-3" suppressHydrationWarning>
            {` · ${format.dayMonth(new Date())}`}
          </small>
        ) : null}
      </span>
      <NotificationBell
        href="/notifications"
        unread={counts?.['/notifications']?.value ?? 0}
        current={active('/notifications')}
      />
      <Link href="/students" className={iconBtn} aria-label={t('searchStudent')}>
        <Icon name="search" />
      </Link>

      <Dialog open={menuOpen} onClose={close} title={t('menu')}>
        <nav aria-label={t('moreMenu')} className="flex flex-col gap-0.5">
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              aria-current={active(item.href) ? 'page' : undefined}
              className="flex min-h-12 items-center gap-3 rounded-sm px-3 font-medium text-fg hover:bg-surface-2 aria-[current=page]:bg-primary-weak aria-[current=page]:text-primary-text"
            >
              <Icon name={item.icon} className="text-fg-3" />
              {tNav(item.label)}
              {item.sub ? <span className="ms-auto text-xs text-fg-3">{item.sub}</span> : null}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => void logout()}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-sm px-3 text-start font-medium text-h-red-fg hover:bg-surface-2"
          >
            <Icon name="back" />
            {t('logout')}
          </button>
        </nav>
      </Dialog>
    </header>
  );
}

export function StaffTabbar({ counts, activeHref }: ChromeProps) {
  const active = useActive(activeHref);
  const quick = useQuickAdd();
  const t = useTranslations('shell');

  return (
    <nav aria-label={t('bottomNav')} className={tabbarClass}>
      {staffTabbarStart.map((item) => (
        <TabLink
          key={item.href}
          item={item}
          active={active(item.href)}
          count={counts?.[item.href]}
        />
      ))}
      <button
        type="button"
        aria-label={t('quickAdd')}
        aria-haspopup="dialog"
        onClick={() => quick?.open()}
        className="flex min-h-tap cursor-pointer flex-col items-center justify-center"
      >
        <span className="-mt-[22px] grid size-[52px] place-items-center rounded-[18px] bg-primary text-white shadow-fab">
          <Icon name="plus" size={26} strokeWidth={2.2} />
        </span>
      </button>
      {staffTabbarEnd.map((item) => (
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

/* ---------------------------------------------------------------------------
   Bottom-bar pieces shared with the student shell.
   --------------------------------------------------------------------------- */
export const tabbarClass =
  'fixed inset-x-0 bottom-0 z-40 grid h-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] grid-cols-5 border-t border-line bg-surface/94 pb-[env(safe-area-inset-bottom)] backdrop-blur-[12px] backdrop-saturate-[1.4] md:hidden';

export function TabLink({
  item,
  active,
  count,
}: {
  item: NavItem;
  active: boolean;
  count?: NavCounts[string];
}) {
  const t = useTranslations('nav');
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-tap flex-col items-center justify-center gap-[3px] text-2xs leading-[14px]',
        active
          ? 'font-bold text-primary-text before:absolute before:inset-x-[30%] before:top-0 before:h-[3px] before:rounded-b-[3px] before:bg-primary'
          : 'font-medium text-fg-3 hover:text-fg',
      )}
    >
      <Icon name={item.icon} size={22} strokeWidth={active ? 2.3 : 1.9} />
      {t(item.label)}
      {count ? (
        <Count
          value={count.value}
          label={count.label}
          tone={count.tone === 'alert' ? 'alert' : 'brand'}
          small
          className="absolute start-[calc(50%+4px)] top-1.5 ring-2 ring-surface"
        />
      ) : null}
    </Link>
  );
}
