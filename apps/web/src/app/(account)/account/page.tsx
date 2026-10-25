import type { Metadata } from 'next';
import { AccountPanel } from '@/components/auth/account-panel';
import { PageHead } from '@/components/ui/page-head';
import { requireUser } from '@/server/auth/current-user';

export const metadata: Metadata = { title: 'حساب من' };

/** M12 / S10 — change password, sign out; deletion only by asking the coach (C5). */
export default async function AccountPage() {
  const user = await requireUser(['admin', 'mentor', 'student']);
  return (
    <>
      <PageHead title="حساب من" />
      <AccountPanel
        user={{ id: user.id, displayName: user.displayName, role: user.role, phone: user.phone }}
      />
    </>
  );
}
