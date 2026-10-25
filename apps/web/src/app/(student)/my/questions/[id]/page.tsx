import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icons/icon';
import { ReplyForm } from '@/components/questions/reply-form';
import { StudentQuestionState } from '@/components/questions/student-question-rows';
import { Thread } from '@/components/questions/thread';
import { Tag } from '@/components/ui/badge';
import { Card, CardHead } from '@/components/ui/card';
import { Alert } from '@/components/ui/states';
import type { StudentQuestionDetailDTO } from '@/modules/questions/contracts';
import { getOwnQuestion } from '@/modules/questions/service';
import { ApiError } from '@/server/http/errors';
import { NoRecord } from '../../../_components';
import { loadOwn } from '../../../_load';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { title: 'سؤال' };

/** S5 — one of my question threads, with the answer and a follow-up box. */
export default async function MyQuestionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { user, actor, student } = await loadOwn();
  if (!student) return <NoRecord />;
  let q: StudentQuestionDetailDTO;
  try {
    q = await getOwnQuestion(actor, id);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403 || err.status === 422))
      notFound();
    throw err;
  }
  const sp = await searchParams;
  const now = new Date();
  return (
    <>
      <nav aria-label="مسیر" className="mb-3 hidden items-center gap-1.5 text-sm text-fg-3 md:flex">
        <Link href="/my/questions" className="font-medium text-fg-2 hover:text-link">
          سؤال‌های من
        </Link>
        <Icon name="chev-next" size={14} />
        <span aria-current="page" className="font-semibold text-fg">
          این سؤال
        </span>
      </nav>
      <h1 className="text-[22px] leading-8 md:text-2xl">
        <bdi>{q.subject}</bdi>
      </h1>
      <div className="mt-2 mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fg-2">
        <StudentQuestionState q={q} expectedResponseText={q.expectedResponseText} />
        {q.priority === 'urgent' ? <Tag variant="urgent">فوری</Tag> : null}
        {q.task ? (
          <Link href={`/my/tasks/${q.task.id}`} className="text-link hover:underline">
            {'درباره‌ی '}
            <bdi>{q.task.title}</bdi>
          </Link>
        ) : null}
      </div>
      {sp.sent ? (
        <Alert tone="ok" role="status" title="سؤالت فرستاده شد.">
          {`${q.expectedResponseText} جواب می‌گیری؛ همین‌جا و در خانه نشانش می‌دهیم.`}
        </Alert>
      ) : null}
      <div className="flex flex-col gap-4 md:gap-5">
        <Card aria-label="گفت‌وگو">
          <Thread
            now={now}
            messages={q.messages.map((m) => ({
              id: m.id,
              authorKey: m.author.isMe ? user.id : `team-${m.author.displayName}`,
              authorName: m.author.isMe ? 'من' : m.author.displayName,
              team: m.author.isTeam,
              mine: m.author.isMe,
              body: m.body,
              links: m.links,
              attachments: m.attachments,
              createdAt: m.createdAt,
            }))}
          />
        </Card>
        <Card aria-labelledby="h-reply">
          <CardHead
            title={q.status === 'closed' ? 'سؤال بسته شده' : 'ادامه‌ی گفت‌وگو'}
            titleId="h-reply"
            icon="chat"
          />
          <ReplyForm threadId={q.id} mode="student" status={q.status} />
        </Card>
      </div>
    </>
  );
}
