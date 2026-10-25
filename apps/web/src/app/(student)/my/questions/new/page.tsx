import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icons/icon';
import { EXTENSION_SUBJECT } from '@/components/questions/labels';
import { NewQuestionForm } from '@/components/questions/new-question-form';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { getPublicSettings } from '@/modules/catalog/service';
import { getOwnTask } from '@/modules/tasks/service';
import { NoRecord } from '../../../_components';
import { loadOwn } from '../../../_load';

export const metadata: Metadata = { title: 'سؤال جدید' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * S5 «سؤال جدید». `?taskId=` attaches one of my tasks (from «سؤال درباره‌ی این کار»);
 * `&kind=extension` is «وقت بیشتری لازم دارم». A task id that is not mine is ignored.
 */
export default async function NewQuestionPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor, student } = await loadOwn();
  if (!student) return <NoRecord />;
  const sp = await searchParams;
  const taskId = one(sp.taskId);
  const [settings, task] = await Promise.all([
    getPublicSettings(actor),
    taskId
      ? getOwnTask(actor, taskId)
          .then((t) => ({ id: t.id, title: t.title }))
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  const extension = one(sp.kind) === 'extension' && task !== null;
  return (
    <>
      <nav aria-label="مسیر" className="mb-3 hidden items-center gap-1.5 text-sm text-fg-3 md:flex">
        {task ? (
          <Link href={`/my/tasks/${task.id}`} className="font-medium text-fg-2 hover:text-link">
            <bdi>{task.title}</bdi>
          </Link>
        ) : (
          <Link href="/my/questions" className="font-medium text-fg-2 hover:text-link">
            سؤال‌های من
          </Link>
        )}
        <Icon name="chev-next" size={14} />
        <span aria-current="page" className="font-semibold text-fg">
          {extension ? EXTENSION_SUBJECT : 'سؤال جدید'}
        </span>
      </nav>
      <PageHead
        title={extension ? 'وقت بیشتری لازم داری؟' : 'سؤال جدید'}
        sub={
          extension
            ? 'به مشاورت بگو؛ اگر منطقی باشد مهلت را تمدید می‌کند.'
            : 'سؤالت به مشاورت می‌رسد و جوابش همین‌جا می‌آید.'
        }
      />
      <Card>
        <NewQuestionForm
          expectedResponseText={settings.questions.expectedResponseText}
          task={task}
          kind={extension ? 'extension' : 'question'}
        />
      </Card>
    </>
  );
}
