import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { faNumber } from '@/components/format/fa';
import type { NavCounts } from '@/components/shell/nav-items';
import { StaffShell } from '@/components/shell/staff-shell';
import { unreadNotificationCount } from '@/modules/notifications/service';
import { openBookingCount } from '@/modules/scheduling/service';
import { getToday } from '@/modules/today/service';
import { requireUser, toActor } from '@/server/auth/current-user';

/** «امروز» badge: everything waiting today (TodayDTO.counts). A failure never blocks the page. */
async function navCounts(actor: ReturnType<typeof toActor>): Promise<NavCounts | undefined> {
  try {
    const { counts: c } = await getToday(actor);
    const total = c.reminders + c.reviews + c.unansweredQuestions + c.stuckStudents;
    const result: NavCounts = {};
    if (total) result['/today'] = { value: total, label: `${faNumber(total)} مورد برای رسیدگی` };
    if (c.unansweredQuestions)
      result['/questions'] = {
        value: c.unansweredQuestions,
        label: `${faNumber(c.unansweredQuestions)} سؤال بی‌پاسخ`,
        tone: 'alert',
      };
    const unread = await unreadNotificationCount(actor);
    if (unread) result['/notifications'] = { value: unread, label: String(unread), tone: 'alert' };
    const requests = await openBookingCount(actor);
    if (requests) {
      const t = await getTranslations('scheduling');
      result['/calendar'] = { value: requests, label: t('openRequests', { count: requests }) };
    }
    return result;
  } catch {
    return undefined;
  }
}

/** Mentor / admin area. Access is enforced again in every service (ADR-0004). */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const user = await requireUser(['admin', 'mentor']);
  const counts = await navCounts(toActor(user));
  return (
    <StaffShell
      user={{ id: user.id, displayName: user.displayName, role: user.role }}
      counts={counts}
    >
      {children}
    </StaffShell>
  );
}
