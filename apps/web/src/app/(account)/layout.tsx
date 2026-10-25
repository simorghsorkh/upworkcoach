import type { ReactNode } from 'react';
import { StaffShell } from '@/components/shell/staff-shell';
import { StudentShell } from '@/components/shell/student-shell';
import { requireUser } from '@/server/auth/current-user';

/**
 * `/account` is shared by every role (sitemap M12 and S10), so it lives in its own
 * route group and picks the shell by role.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requireUser(['admin', 'mentor', 'student']);
  const shellUser = { id: user.id, displayName: user.displayName, role: user.role };
  return user.role === 'student' ? (
    <StudentShell user={shellUser}>{children}</StudentShell>
  ) : (
    <StaffShell user={shellUser}>{children}</StaffShell>
  );
}
