import type { Metadata } from 'next';
import { TeamManager, type TeamMember } from '@/components/team/team-manager';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { listUsers } from '@/modules/identity/service';
import { listStudents } from '@/modules/students/service';
import { requireUser, toActor } from '@/server/auth/current-user';

export const metadata: Metadata = { title: 'تیم' };

/**
 * "Team" (admin only; the (admin) layout redirects mentors): mentors and admins, invites,
 * fresh links, disable / enable and role change (F1, followups F-02 and F-06).
 */
export default async function TeamPage() {
  const user = await requireUser(['admin']);
  const actor = toActor(user);
  const [mentors, admins] = await Promise.all([
    listUsers(actor, { role: 'mentor' }),
    listUsers(actor, { role: 'admin' }),
  ]);
  // Students in flow per mentor: `counts.total` of a one-row page, one cheap query each.
  const counts = await Promise.all(
    mentors.items.map((m) =>
      listStudents(actor, { mentorId: m.id, limit: 1 })
        .then((r) => r.counts?.total ?? null)
        .catch(() => null),
    ),
  );
  const members: TeamMember[] = [
    ...admins.items.map((a) => ({ ...a, studentCount: null })),
    ...mentors.items.map((m, i) => ({ ...m, studentCount: counts[i] ?? null })),
  ].filter((m) => !m.erasedAt);
  return (
    <>
      <PageHead
        title="تیم"
        sub="مشاورها و مدیرها؛ دعوت با لینک یک‌بارمصرف که خودت در تلگرام می‌فرستی."
      />
      <Card aria-label="اعضای تیم">
        <TeamManager members={members} viewerId={user.id} />
      </Card>
    </>
  );
}
