import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import type { NavCounts } from './nav-items';
import { QuickAddProvider } from './quick-add';
import { SkipLink } from './skip-link';
import { type ShellUser, StaffSidebar, StaffTabbar, StaffTopbar } from './staff-chrome';

/**
 * Mentor / admin shell — design-system §3-1, mockups/today.html:
 * ≥ 768px dark sidebar (256px, 224px on tablet) + content up to 1360px;
 * < 768px sticky top bar, content, fixed bottom bar with the «+» quick-add button.
 */
export function StaffShell({
  user,
  counts,
  activeHref,
  children,
}: {
  user: ShellUser;
  counts?: NavCounts;
  activeHref?: string;
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <QuickAddProvider>
        <SkipLink />
        <div className="min-h-dvh md:grid md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
          <StaffSidebar user={user} counts={counts} activeHref={activeHref} />
          <StaffTopbar user={user} activeHref={activeHref} />
          <main
            id="main"
            tabIndex={-1}
            className="min-w-0 px-4 pt-4 pb-[calc(var(--tabbar-h)+var(--sp-8))] focus:outline-none md:p-6 lg:px-10 lg:pt-8 lg:pb-16"
          >
            <div className="mx-auto max-w-content">{children}</div>
          </main>
          <StaffTabbar user={user} counts={counts} activeHref={activeHref} />
        </div>
      </QuickAddProvider>
    </ToastProvider>
  );
}
