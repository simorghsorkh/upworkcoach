import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AccountPanel } from '@/components/auth/account-panel';
import { Gallery } from '@/components/dev/gallery';
import { StaffShell } from '@/components/shell/staff-shell';
import { StudentShell } from '@/components/shell/student-shell';
import { PageHead } from '@/components/ui/page-head';

export const metadata: Metadata = { title: 'پیش‌نمایش قاب (dev)' };

const fakeUsers = {
  admin: { id: '00000000-0000-4000-8000-000000000001', displayName: 'مربی', role: 'admin' },
  mentor: { id: '00000000-0000-4000-8000-000000000002', displayName: 'رضا محمدی', role: 'mentor' },
  student: {
    id: '00000000-0000-4000-8000-000000000003',
    displayName: 'سارا احمدی',
    role: 'student',
  },
} as const;

/**
 * Development-only preview of the shells with a fake user, so the frame can be
 * checked (and tested by Playwright) before the session module exists.
 * Returns 404 in every non-development build.
 * `?role=admin|mentor|student` · `?active=/today` (highlighted nav item) ·
 * `?view=account` (the "My account" panel instead of the component gallery).
 */
export default async function DevShellPage({ searchParams }: PageProps<'/dev/shell'>) {
  if (process.env.NODE_ENV !== 'development') notFound();

  const params = await searchParams;
  const role =
    params.role === 'mentor' || params.role === 'student' ? params.role : ('admin' as const);
  const user = fakeUsers[role];
  const isAccount = params.view === 'account';
  const active =
    typeof params.active === 'string'
      ? params.active
      : isAccount
        ? '/account'
        : role === 'student'
          ? '/home'
          : '/today';
  const content = isAccount ? (
    <>
      <PageHead title="حساب من" />
      <AccountPanel user={{ ...user, phone: '+989121234567' }} />
    </>
  ) : (
    <Gallery role={role} />
  );

  if (role === 'student') {
    return (
      <StudentShell
        user={user}
        activeHref={active}
        counts={{
          '/my/tasks': { value: 1, label: '۱ بازخورد جدید' },
          '/my/questions': { value: 1, label: '۱ پاسخ جدید' },
        }}
      >
        {content}
      </StudentShell>
    );
  }
  return (
    <StaffShell
      user={user}
      activeHref={active}
      counts={{
        '/today': { value: 18, label: '۱۸ مورد' },
        '/questions': { value: 3, label: '۳ سؤال بی‌پاسخ', tone: 'alert' },
      }}
    >
      {content}
    </StaffShell>
  );
}
