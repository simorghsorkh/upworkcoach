import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { faDayMonth, faDays, faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { formatRate, ProfileStatusChip } from '@/components/profiles/profile-display';
import { AssigneeForm } from '@/components/questions/assignee-form';
import { questionStatusLabel } from '@/components/questions/labels';
import { QuestionSla, QuestionSubject } from '@/components/questions/question-rows';
import { ReplyForm } from '@/components/questions/reply-form';
import { Thread } from '@/components/questions/thread';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { ExternalLink } from '@/components/ui/ltr';
import { PlatformBadge } from '@/components/ui/platform';
import { Alert, EmptyState } from '@/components/ui/states';
import { listCannedResponses } from '@/modules/catalog/service';
import { listMentors } from '@/modules/identity/service';
import type { StaffQuestionDetailDTO } from '@/modules/questions/contracts';
import { getStaffQuestion } from '@/modules/questions/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';

type Params = Promise<{ id: string }>;

export const metadata: Metadata = { title: 'سؤال' };

/**
 * M8 — a question thread with the record summary next to it (F8; the two-column pattern of
 * M6). `viaAssignment`: the viewer sees this thread only as its assignee, so there is no link
 * to the full record (ADR-0004); the summary comes with the thread.
 */
export default async function StaffQuestionPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const isAdmin = user.role === 'admin';
  let q: StaffQuestionDetailDTO;
  try {
    q = await getStaffQuestion(actor, id);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403 || err.status === 422))
      notFound();
    throw err;
  }
  const [canned, staff] = await Promise.all([
    listCannedResponses(actor).catch(() => []),
    isAdmin ? listMentors(actor) : Promise.resolve([]),
  ]);
  const now = new Date();
  const s = q.studentSummary;
  const firstName = q.student.displayName.trim().split(/\s+/)[0] ?? q.student.displayName;

  return (
    <>
      <nav
        aria-label="مسیر"
        className="mb-3 hidden flex-wrap items-center gap-1.5 text-sm text-fg-3 md:flex"
      >
        <Link href="/questions" className="font-medium text-fg-2 hover:text-link">
          سؤال‌ها
        </Link>
        <Icon name="chev-next" size={14} />
        <span aria-current="page" className="font-semibold text-fg">
          {q.student.displayName}
        </span>
        <span>·</span>
        <Link href="/today" className="font-medium text-fg-2 hover:text-link">
          بازگشت به امروز
        </Link>
      </nav>
      <h1 className="text-[22px] leading-8 md:text-2xl">
        <QuestionSubject q={q} />
      </h1>
      <div className="mt-2 mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fg-2">
        <span className="font-semibold text-fg">{questionStatusLabel[q.status]}</span>
        <QuestionSla q={q} now={now} />
        {q.priority === 'urgent' ? <Tag variant="urgent">فوری</Tag> : null}
        {q.task ? (
          <Link
            href={q.viaAssignment ? '#summary' : `/tasks/${q.task.id}`}
            className="text-link hover:underline"
          >
            {'درباره‌ی '}
            <bdi>{q.task.title}</bdi>
          </Link>
        ) : null}
        <span>{`پاسخ‌گو: ${q.assignee.id === user.id ? 'خودم' : q.assignee.displayName}`}</span>
        {q.viaAssignment ? <Tag variant="outline">واگذارشده به تو</Tag> : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          {q.source === 'checkin' ? (
            <Alert tone="info" title="از check-in هفتگی.">
              {`${firstName} در check-in گفت به کمک نیاز دارد؛ متن مانع را پایین می‌بینی.`}
            </Alert>
          ) : null}
          <Card aria-label="گفت‌وگو">
            <Thread
              now={now}
              messages={q.messages.map((m) => ({
                id: m.id,
                authorKey: m.author.id,
                authorName: m.author.id === user.id ? 'من' : m.author.displayName,
                team: m.author.role !== 'student',
                mine: m.author.role !== 'student',
                body: m.body,
                links: m.links,
                attachments: m.attachments,
                createdAt: m.createdAt,
              }))}
            />
          </Card>
          <Card aria-labelledby="h-reply">
            <CardHead title={`پاسخ به ${firstName}`} titleId="h-reply" icon="pen" />
            <ReplyForm threadId={q.id} mode="staff" status={q.status} canned={canned} />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:gap-5 lg:sticky lg:top-6">
          <Card id="summary" aria-labelledby="h-sum" className="scroll-mt-24">
            <div className="mb-3 flex items-center gap-3">
              <Avatar id={s.id} name={s.displayName} />
              <div className="min-w-0 flex-1">
                <h2 id="h-sum" className="text-h2">
                  {s.displayName}
                </h2>
                <p className="text-sm text-fg-2">
                  {`${s.stage.displayCode} ${s.stage.name} · ${faDays(s.daysInStage)}`}
                </p>
              </div>
            </div>
            <h3 className="mt-4 mb-2 text-xs font-semibold text-fg-3">ویترین‌ها</h3>
            {s.profiles.length ? (
              <ul className="flex flex-col gap-2">
                {s.profiles.map((p) => (
                  <li key={p.id} className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <PlatformBadge name={p.platform.name} />
                      <ProfileStatusChip status={p.status} />
                      {formatRate(p) ? <span className="text-fg-2">{formatRate(p)}</span> : null}
                    </span>
                    {p.publicUrl ? <ExternalLink href={p.publicUrl} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-3">هنوز ویترینی ثبت نشده.</p>
            )}
            <h3 className="mt-4 mb-2 text-xs font-semibold text-fg-3">
              {`کارهای باز (${faNumber(s.openTasks.length)})`}
            </h3>
            {s.openTasks.length ? (
              <ul className="flex flex-col gap-2">
                {s.openTasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                    {q.viaAssignment ? (
                      <bdi className="font-medium text-fg">{t.title}</bdi>
                    ) : (
                      <Link href={`/tasks/${t.id}`} className="font-medium text-fg hover:text-link">
                        <bdi>{t.title}</bdi>
                      </Link>
                    )}
                    {t.overdue ? (
                      <Tag variant="overdue">معوق</Tag>
                    ) : (
                      <span className="text-xs text-fg-3">{`تا ${faDayMonth(new Date(t.dueAt))}`}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="tasks" title="کار بازی ندارد" className="px-0 py-3" />
            )}
            {q.viaAssignment ? (
              <p className="mt-4 text-xs text-fg-3">
                این هنرجو در فهرست تو نیست؛ فقط تا وقتی این سؤال باز است خلاصه‌اش را می‌بینی.
              </p>
            ) : (
              <Link
                href={`/students/${s.id}`}
                className={buttonClass({ size: 'sm', block: true, className: 'mt-4' })}
              >
                پرونده‌ی کامل
              </Link>
            )}
          </Card>
          {isAdmin ? (
            <Card aria-labelledby="h-assign">
              <CardHead title="واگذاری" titleId="h-assign" icon="users" />
              <AssigneeForm
                threadId={q.id}
                current={q.assignee.id}
                staff={staff}
                viewerId={user.id}
              />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
