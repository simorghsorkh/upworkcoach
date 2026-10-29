import type { Metadata } from 'next';
import Link from 'next/link';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { submissionTypeLabel } from '@/components/tasks/labels';
import { NewTaskButton } from '@/components/tasks/new-task-dialog';
import { sortQueue } from '@/components/tasks/review-queue-list';
import { TaskFilters } from '@/components/tasks/task-filters';
import { type TaskRow, TasksTable } from '@/components/tasks/tasks-table';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import type { SubmissionType } from '@/modules/catalog/contracts';
import { listStages, listTaskTemplates } from '@/modules/catalog/service';
import { listMentors } from '@/modules/identity/service';
import { listRuns } from '@/modules/programs/service';
import type { ReviewQueueItemDTO, StaffTaskDTO, StaffTasksQuery } from '@/modules/tasks/contracts';
import { getReviewQueue, listStaffTasks } from '@/modules/tasks/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { param } from '../_data';

export const metadata: Metadata = { title: 'کارها' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS = [
  { key: 'review', label: 'منتظر بازبینی' },
  { key: 'overdue', label: 'معوق' },
  { key: 'open', label: 'باز و در حال انجام' },
  { key: 'changes', label: 'نیاز به اصلاح' },
  { key: 'all', label: 'همه' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const TYPES: SubmissionType[] = [
  'proposal_review',
  'profile_review',
  'text',
  'link',
  'file',
  'checkbox',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fromTask(t: StaffTaskDTO, q?: ReviewQueueItemDTO): TaskRow {
  return {
    id: t.id,
    title: t.title,
    student: t.student,
    status: t.status,
    submissionType: t.submissionType,
    priority: t.priority,
    requiredForGate: t.requiredForGate,
    dueAt: t.dueAt,
    overdue: t.overdue,
    overdueDays: t.overdueDays,
    extensionCount: t.extensionCount,
    revisionCount: t.revisionCount,
    version: q?.version ?? null,
    lastSubmittedAt: t.lastSubmittedAt,
    program: q?.program && !q.program.isLegacy ? q.program.title : null,
    sla: q
      ? {
          breached: q.breached,
          warning: q.warning,
          elapsedHours: q.elapsedHours,
          slaRemainingHours: q.slaRemainingHours,
        }
      : null,
  };
}

function fromQueue(q: ReviewQueueItemDTO): TaskRow {
  return {
    id: q.taskId,
    title: q.title,
    student: q.student,
    status: 'submitted',
    submissionType: q.submissionType ?? null,
    priority: q.priority,
    requiredForGate: q.requiredForGate,
    dueAt: q.dueAt ?? null,
    overdue: false,
    overdueDays: 0,
    extensionCount: 0,
    revisionCount: 0,
    version: q.version,
    lastSubmittedAt: q.lastSubmittedAt,
    program: q.program && !q.program.isLegacy ? q.program.title : null,
    sla: {
      breached: q.breached,
      warning: q.warning,
      elapsedHours: q.elapsedHours,
      slaRemainingHours: q.slaRemainingHours,
    },
  };
}

/**
 * M5 «کارها» (mockups/tasks.html): tabs for the review queue (late and urgent first), overdue,
 * open, changes requested and everything; search and filters in the URL; «کار جدید» opens the
 * M5a sheet (also from `/tasks/new` and the quick-add «+», via `?new=1`).
 */
export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const isAdmin = user.role === 'admin';
  const sp = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === param(sp.tab))?.key ?? 'review') as Tab;
  const q = param(sp.q);
  const typeParam = param(sp.type);
  const type = (TYPES as string[]).includes(typeParam) ? (typeParam as SubmissionType) : undefined;
  const stageParam = param(sp.stage);
  const stage = UUID.test(stageParam) ? stageParam : undefined;
  const mentorParam = isAdmin ? param(sp.mentor) : '';
  const mentorId = UUID.test(mentorParam) ? mentorParam : undefined;
  const cursor = param(sp.cursor) || undefined;
  // Review tab only (sprint 5): program run and SLA state narrow the queue itself.
  const runParam = tab === 'review' ? param(sp.run) : '';
  const runId = UUID.test(runParam) ? runParam : undefined;
  const slaParam = tab === 'review' ? param(sp.sla) : '';
  const sla = (['breached', 'warning', 'ok'] as const).find((s) => s === slaParam);

  // GET /tasks (sprint-3 gap 1): filters and scope in SQL; `counts` ignore status/overdue, so
  // one request gives every tab's number. The review tab keeps the SLA queue order.
  const filters: StaffTasksQuery = {
    ...(q ? { q } : {}),
    ...(type ? { submissionType: type } : {}),
    ...(stage ? { stageId: stage } : {}),
    ...(mentorId ? { mentorId } : {}),
  };
  const tabQuery: Record<Tab, StaffTasksQuery> = {
    review: { status: ['submitted'], limit: 100 },
    overdue: { overdue: true, limit: 100, cursor },
    open: { status: ['open', 'in_progress'], limit: 100, cursor },
    changes: { status: ['changes_requested'], limit: 100, cursor },
    all: {
      status: ['open', 'in_progress', 'submitted', 'changes_requested', 'accepted', 'cancelled'],
      sort: 'recent',
      limit: 100,
      cursor,
    },
  };
  const [queue, list, stages, templates, mentors, runs] = await Promise.all([
    getReviewQueue(actor, {
      ...(mentorId ? { mentorId } : {}),
      ...(runId ? { runId } : {}),
      ...(sla ? { sla } : {}),
    }),
    listStaffTasks(actor, { ...filters, ...tabQuery[tab] }).catch(() =>
      listStaffTasks(actor, { ...filters, ...tabQuery[tab], cursor: undefined }),
    ),
    listStages(actor),
    listTaskTemplates(actor, {}),
    isAdmin ? listMentors(actor) : Promise.resolve([]),
    tab === 'review' ? listRuns(actor, { status: 'active' }) : Promise.resolve([]),
  ]);
  const now = new Date();
  const c = list.counts;
  const counts: Record<Tab, number | null> = {
    review: c.byStatus.submitted,
    overdue: c.overdue,
    open: c.byStatus.open + c.byStatus.in_progress,
    changes: c.byStatus.changes_requested,
    all: c.total,
  };

  const byId = new Map<string, StaffTaskDTO>(list.items.map((t) => [t.id, t]));
  const queueById = new Map(queue.map((x) => [x.taskId, x]));
  let rows: TaskRow[];
  if (tab === 'review') {
    // Queue order (late and urgent first); only the tasks that pass the filters.
    const narrowed = Boolean(q || type || stage);
    rows = sortQueue(queue)
      .filter((x) => byId.has(x.taskId) || !narrowed)
      .map((x) => {
        const t = byId.get(x.taskId);
        return t ? fromTask(t, x) : fromQueue(x);
      });
  } else if (tab === 'overdue') {
    rows = [...list.items].sort((a, b) => b.overdueDays - a.overdueDays).map((t) => fromTask(t));
  } else {
    rows = list.items.map((t) => fromTask(t, queueById.get(t.id)));
  }
  const filtered = rows;
  const nextHref = tab !== 'review' && list.nextCursor ? list.nextCursor : null;

  const stageOptions = stages.map((s) => ({ id: s.id, label: `${s.displayCode} — ${s.name}` }));
  const href = (key: Tab) => {
    const next = new URLSearchParams();
    if (key !== 'review') next.set('tab', key);
    for (const k of ['q', 'type', 'stage', 'mentor'] as const) {
      const v = param(sp[k]);
      if (v) next.set(k, v);
    }
    const s = next.toString();
    return s ? `/tasks?${s}` : '/tasks';
  };
  const filtersOn = Boolean(q || type || stage || runId || sla);
  const pageHref = (next: string | null) => {
    const base = href(tab);
    return next
      ? `${base}${base.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(next)}`
      : base;
  };

  return (
    <>
      <PageHead
        title="کارها"
        sub={`${faNumber(c.byStatus.submitted)} منتظر بازبینی · ${faNumber(c.overdue)} معوق · ${faNumber(c.byStatus.open + c.byStatus.in_progress + c.byStatus.changes_requested)} باز`}
        actions={
          <NewTaskButton
            context={{
              templates,
              stages: stageOptions,
              reviewers: mentors.map((m) => ({
                id: m.id,
                label: m.id === user.id ? 'خودم' : m.displayName,
              })),
            }}
            initiallyOpen={param(sp.new) === '1'}
            goToTask
          />
        }
      />

      <nav
        aria-label="دسته‌ی کارها"
        className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0"
      >
        {TABS.map((t) => {
          const current = t.key === tab;
          const n = counts[t.key];
          return (
            <Link
              key={t.key}
              href={href(t.key)}
              aria-current={current ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex min-h-tap items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-ui',
                current
                  ? 'border-primary font-bold text-fg'
                  : 'border-transparent font-medium text-fg-2 hover:border-line-2 hover:text-fg',
              )}
            >
              {t.key === 'review' ? <Icon name="hourglass" size={16} /> : null}
              {t.label}
              {n !== null ? (
                <span
                  className={cn(
                    'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-2xs font-bold',
                    t.key === 'overdue' && n
                      ? 'bg-h-solid text-white'
                      : current
                        ? 'bg-primary text-on-brand'
                        : 'bg-surface-3 text-fg-2',
                  )}
                >
                  {faNumber(n)}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <TaskFilters
        types={TYPES.map((t) => ({ id: t, label: submissionTypeLabel[t] }))}
        mentors={
          isAdmin
            ? mentors.map((m) => ({ id: m.id, label: m.id === user.id ? 'خودم' : m.displayName }))
            : null
        }
        stages={stageOptions}
        runs={
          tab === 'review'
            ? runs.filter((r) => !r.isLegacy).map((r) => ({ id: r.id, label: r.title }))
            : null
        }
      />

      {filtered.length ? (
        <>
          <TasksTable
            rows={filtered}
            now={now}
            caption={`${TABS.find((t) => t.key === tab)?.label ?? ''}${tab === 'review' ? '، دیرترین و قدیمی‌ترین اول' : ''}`}
          />
          {cursor || nextHref ? (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
              {cursor ? (
                <Link
                  href={pageHref(null)}
                  className={buttonClass({ size: 'sm', variant: 'ghost' })}
                >
                  از اول فهرست
                </Link>
              ) : null}
              {nextHref ? (
                <Link href={pageHref(nextHref)} className={buttonClass({ size: 'sm' })}>
                  صفحه‌ی بعد
                  <Icon name="chev-next" size={16} />
                </Link>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <Card>
          {filtersOn ? (
            <EmptyState icon="search" title="کاری با این فیلتر نیست" className="py-6">
              جستجو یا فیلترها را تغییر بده.
            </EmptyState>
          ) : tab === 'review' ? (
            <EmptyState
              icon="check-circle"
              tone="ok"
              title="تحویلی منتظر بازبینی نیست"
              className="py-6"
            >
              هر تحویل تازه همین‌جا می‌آید؛ دیرها و فوری‌ها اول.
            </EmptyState>
          ) : tab === 'overdue' ? (
            <EmptyState icon="check-circle" tone="ok" title="کار معوقی نیست" className="py-6">
              هیچ کاری از مهلتش نگذشته است.
            </EmptyState>
          ) : (
            <EmptyState icon="tasks" tone="brand" title="کاری این‌جا نیست" className="py-6">
              با «کار جدید» برای یک یا چند هنرجو کار تعریف کن.
            </EmptyState>
          )}
        </Card>
      )}
    </>
  );
}
