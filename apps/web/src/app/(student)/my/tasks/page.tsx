import type { Metadata } from 'next';
import Link from 'next/link';
import { faNumber } from '@/components/format/fa';
import { StudentTaskItem } from '@/components/tasks/student-task-bits';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import { listOwnTasks } from '@/modules/tasks/service';
import { NoRecord } from '../../_components';
import { loadOwn } from '../../_load';

export const metadata: Metadata = { title: 'کارهای من' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * S2 "My tasks" (sitemap §4): overdue first and red, then by deadline (the API orders them);
 * finished ones under "Done". No health, rule or internal field ever appears.
 */
export default async function MyTasksPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor, student } = await loadOwn();
  if (!student) return <NoRecord />;
  const sp = await searchParams;
  const showDone = sp.show === 'done';
  const tasks = await listOwnTasks(actor);
  const now = new Date();
  const open = tasks.filter((t) => t.status !== 'accepted' && t.status !== 'cancelled');
  const done = tasks.filter((t) => t.status === 'accepted');
  const overdue = open.filter((t) => t.overdue).length;
  const list = showDone ? done : open;

  return (
    <>
      <PageHead
        title="کارهای من"
        sub={
          open.length
            ? `${faNumber(open.length)} کار باز${overdue ? ` · ${faNumber(overdue)} عقب‌افتاده` : ''}`
            : 'کار بازی نداری'
        }
      />
      <nav
        aria-label="دسته‌ی کارها"
        className="-mx-4 mb-4 flex gap-1 border-b border-line px-4 md:mx-0 md:px-0"
      >
        {[
          { href: '/my/tasks', label: 'باز', n: open.length, current: !showDone },
          { href: '/my/tasks?show=done', label: 'انجام‌شده', n: done.length, current: showDone },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.current ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex min-h-tap items-center gap-1.5 border-b-2 px-3 text-ui',
              t.current
                ? 'border-primary font-bold text-fg'
                : 'border-transparent font-medium text-fg-2 hover:text-fg',
            )}
          >
            {t.label}
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-3 px-[5px] text-2xs font-bold">
              {faNumber(t.n)}
            </span>
          </Link>
        ))}
      </nav>
      <Card aria-label={showDone ? 'کارهای انجام‌شده' : 'کارهای باز'}>
        {list.length ? (
          <ul className="-mx-4 -my-1 md:-mx-5">
            {list.map((t) => (
              <StudentTaskItem key={t.id} task={t} now={now} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="check-circle"
            tone="ok"
            title={showDone ? 'هنوز کاری پذیرفته نشده' : 'کار بازی نداری'}
            className="py-6"
          >
            {showDone
              ? 'کارهایی که مشاورت می‌پذیرد این‌جا جمع می‌شوند.'
              : 'وقتی مشاورت کار تازه‌ای بخواهد، همین‌جا و در خانه می‌بینی.'}
          </EmptyState>
        )}
      </Card>
    </>
  );
}
