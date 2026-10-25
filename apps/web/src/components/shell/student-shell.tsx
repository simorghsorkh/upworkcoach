import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import type { NavCounts } from './nav-items';
import { SkipLink } from './skip-link';
import type { ShellUser } from './staff-chrome';
import { StudentTabbar, StudentTopbar } from './student-chrome';

/**
 * Student shell — design-system §3-2, mockups/student-home.html:
 * ≥ 768px translucent 64px top bar with five pill links, content column up to 760px;
 * < 768px top bar (brand + account) and a five-item bottom bar.
 */
export function StudentShell({
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
      <SkipLink />
      <div className="min-h-dvh">
        <StudentTopbar user={user} counts={counts} activeHref={activeHref} />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-student px-4 pt-4 pb-[calc(var(--tabbar-h)+var(--sp-8))] focus:outline-none md:px-6 md:pt-8 md:pb-16"
        >
          {children}
        </main>
        <StudentTabbar user={user} counts={counts} activeHref={activeHref} />
      </div>
    </ToastProvider>
  );
}
