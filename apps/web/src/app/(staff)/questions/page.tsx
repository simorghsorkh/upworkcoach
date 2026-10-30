import type { Metadata } from 'next';
import Link from 'next/link';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { QuestionRows } from '@/components/questions/question-rows';
import { MentorFilter } from '@/components/stages/mentor-filter';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { ChipLink } from '@/components/ui/seg';
import { Alert, EmptyState } from '@/components/ui/states';
import { getStaffSettings } from '@/modules/catalog/service';
import { listMentors } from '@/modules/identity/service';
import { type ListQuestionsQuery, listQuestionsQuery } from '@/modules/questions/contracts';
import { listQuestions } from '@/modules/questions/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';
import { param } from '../_data';

export const metadata: Metadata = { title: 'سؤال‌ها' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VIEWS = [
  { key: 'team', label: 'منتظر ما', query: { awaiting: 'team' } },
  { key: 'student', label: 'منتظر هنرجو', query: { awaiting: 'student' } },
  { key: 'closed', label: 'بسته', query: { status: 'closed' } },
  { key: 'all', label: 'همه', query: {} },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  query: Pick<ListQuestionsQuery, 'awaiting' | 'status'>;
}>;

/**
 * M7 — the question queue (F8; same list pattern as M5). Default view "Waiting on us": threads
 * where the ball is with the team, the oldest SLA first (backend order). An admin can narrow
 * it to one person's threads. Mentors see their scope plus threads assigned to them.
 */
export default async function QuestionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const isAdmin = user.role === 'admin';
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === param(sp.view)) ?? VIEWS[0];
  const assigneeId = isAdmin ? param(sp.assigneeId) : '';
  const cursor = param(sp.cursor);
  const parsed = listQuestionsQuery.safeParse({
    ...view.query,
    ...(assigneeId ? { assigneeId } : {}),
    ...(cursor ? { cursor } : {}),
    limit: '50',
  });
  let warning: string | null = parsed.success ? null : 'فیلتر نامعتبر بود و نادیده گرفته شد.';
  const query: ListQuestionsQuery = parsed.success ? parsed.data : { ...view.query, limit: 50 };

  const [mentors, settings] = await Promise.all([
    isAdmin ? listMentors(actor) : Promise.resolve([]),
    getStaffSettings(actor).catch(() => null),
  ]);
  let list: Awaited<ReturnType<typeof listQuestions>>;
  try {
    list = await listQuestions(actor, query);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 422) throw err;
    warning = 'این صفحه از فهرست دیگر معتبر نیست؛ از اول فهرست ببین.';
    list = await listQuestions(actor, { ...query, cursor: undefined });
  }
  const now = new Date();
  const breached = list.items.filter((q) => q.sla?.breached).length;

  const href = (next: { view?: string; cursor?: string }) => {
    const p = new URLSearchParams();
    const v = next.view ?? view.key;
    if (v !== 'team') p.set('view', v);
    if (assigneeId) p.set('assigneeId', assigneeId);
    if (next.cursor) p.set('cursor', next.cursor);
    const q = p.toString();
    return q ? `/questions?${q}` : '/questions';
  };
  const keep: Record<string, string> = view.key === 'team' ? {} : { view: view.key };

  return (
    <>
      <PageHead
        title="سؤال‌ها"
        sub={
          settings
            ? `زمان پاسخ: ${faNumber(settings.sla.questionHours)} ساعت${settings.sla.clock === 'business' ? ' کاری' : ''} · فوری ${faNumber(settings.sla.urgentQuestionHours)} ساعت${breached ? ` · ${faNumber(breached)} سؤال از زمان پاسخ گذشته` : ''}`
            : undefined
        }
        actions={
          isAdmin ? (
            <MentorFilter
              param="assigneeId"
              label="پاسخ‌گو"
              allowNone={false}
              keep={keep}
              value={assigneeId}
              mentors={mentors.map((m) => ({
                id: m.id,
                label: m.id === user.id ? 'خودم' : m.displayName,
              }))}
            />
          ) : null
        }
      />
      <nav aria-label="نما" className="mb-4 flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <ChipLink key={v.key} href={href({ view: v.key })} active={v.key === view.key}>
            {v.label}
          </ChipLink>
        ))}
      </nav>
      {warning ? <Alert tone="warn" title={warning} /> : null}
      <Card aria-label={`سؤال‌ها: ${view.label}`}>
        {list.items.length ? (
          <QuestionRows
            items={list.items}
            now={now}
            viewerId={user.id}
            showAssignee={isAdmin && !assigneeId}
          />
        ) : (
          <EmptyState
            icon={view.key === 'team' ? 'check-circle' : 'chat'}
            tone={view.key === 'team' ? 'ok' : 'neutral'}
            title={view.key === 'team' ? 'سؤالی منتظر شما نیست' : 'سؤالی در این بخش نیست'}
            headingLevel={2}
          >
            {view.key === 'team'
              ? 'هر سؤال تازه‌ی هنرجوها با زمان باقی‌مانده تا موعد پاسخ همین‌جا می‌آید.'
              : 'با بخش‌های دیگر یا فیلتر پاسخ‌گو ببین.'}
          </EmptyState>
        )}
      </Card>
      {cursor || list.nextCursor ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          {cursor ? (
            <Link href={href({})} className={buttonClass({ size: 'sm', variant: 'ghost' })}>
              از اول فهرست
            </Link>
          ) : null}
          {list.nextCursor ? (
            <Link href={href({ cursor: list.nextCursor })} className={buttonClass({ size: 'sm' })}>
              صفحه‌ی بعد
              <Icon name="chev-next" size={16} />
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
