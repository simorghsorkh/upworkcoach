import type { Metadata } from 'next';
import Link from 'next/link';
import { faNumber } from '@/components/format/fa';
import { Board } from '@/components/stages/board';
import { MentorFilter } from '@/components/stages/mentor-filter';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { SegNav } from '@/components/ui/seg';
import { EmptyState } from '@/components/ui/states';
import { listTaskTemplates } from '@/modules/catalog/service';
import { listMentors } from '@/modules/identity/service';
import { boardQuery } from '@/modules/path/contracts';
import { getBoard } from '@/modules/path/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { param } from '../_data';

export const metadata: Metadata = { title: 'مراحل مسیر' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** M4 — stages kanban (mockups/kanban.html). */
export default async function StagesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const isAdmin = user.role === 'admin';
  const sp = await searchParams;
  const mentorId = isAdmin ? param(sp.mentorId) : '';
  const parsed = boardQuery.safeParse(mentorId ? { mentorId } : {});
  const [board, mentors, templates] = await Promise.all([
    getBoard(actor, parsed.success ? parsed.data : {}),
    isAdmin ? listMentors(actor) : Promise.resolve([]),
    listTaskTemplates(actor, {}).catch(() => []),
  ]);

  const all = board.columns.flatMap((c) => c.students);
  const active = all.filter((s) => s.lifecycleStatus === 'active').length;
  const paused = all.filter((s) => s.lifecycleStatus === 'paused').length;

  return (
    <>
      <PageHead
        title="مراحل مسیر"
        sub={`${faNumber(active)} هنرجوی فعال · ${faNumber(paused)} متوقف`}
        actions={
          <>
            <SegNav
              label="نوع نما"
              current="/stages"
              items={[
                { href: '/students', label: 'فهرست', icon: 'list' },
                { href: '/stages', label: 'مراحل', icon: 'board' },
              ]}
            />
            {isAdmin ? (
              <MentorFilter
                value={parsed.success ? mentorId : ''}
                mentors={mentors.map((m) => ({
                  id: m.id,
                  label: m.id === user.id ? 'خودم' : m.displayName,
                }))}
              />
            ) : null}
          </>
        }
      />
      {all.length === 0 && !mentorId ? (
        <Card>
          <EmptyState
            icon="board"
            tone="brand"
            title="هنوز هنرجویی در مسیر نیست"
            headingLevel={2}
            action={
              <Link href="/students?new=1" className={buttonClass({ variant: 'primary' })}>
                هنرجوی جدید
              </Link>
            }
          >
            وقتی هنرجو بسازی، این‌جا می‌بینی هر کس در کدام مرحله است و چند روز مانده.
          </EmptyState>
        </Card>
      ) : (
        <Board columns={board.columns} templates={templates} />
      )}
    </>
  );
}
