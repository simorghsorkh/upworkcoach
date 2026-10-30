import type { ReactNode } from 'react';
import { faNumber } from '@/components/format/fa';
import type { NavCounts } from '@/components/shell/nav-items';
import { StudentShell } from '@/components/shell/student-shell';
import { getCurrentCheckin } from '@/modules/checkins/service';
import { unreadNotificationCount } from '@/modules/notifications/service';
import { listOwnQuestions } from '@/modules/questions/service';
import { requireUser, toActor } from '@/server/auth/current-user';

/**
 * In-app badges (F10): new replies on "Questions", the weekly check-in on "Home". Only student
 * DTOs; a failure never blocks the page.
 */
async function navCounts(actor: ReturnType<typeof toActor>): Promise<NavCounts | undefined> {
  const [questions, checkin, unread] = await Promise.all([
    listOwnQuestions(actor).catch(() => null),
    getCurrentCheckin(actor).catch(() => null),
    unreadNotificationCount(actor).catch(() => 0),
  ]);
  const result: NavCounts = {};
  const replies = questions?.items.filter((q) => q.hasNewReply).length ?? 0;
  if (replies)
    result['/my/questions'] = { value: replies, label: `${faNumber(replies)} پاسخ جدید` };
  if (unread) result['/my/notifications'] = { value: unread, label: String(unread) };
  if (checkin?.open && !checkin.existing)
    result['/home'] = { value: 1, label: 'check-in این هفته' };
  return result;
}

/** Student area: only student DTOs, no internal fields (tech-stack.md §3 rule 4). */
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const user = await requireUser(['student']);
  const counts = await navCounts(toActor(user));
  return (
    <StudentShell
      user={{ id: user.id, displayName: user.displayName, role: user.role }}
      counts={counts}
    >
      {children}
    </StudentShell>
  );
}
