import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icons/icon';
import {
  StudentQuestionRows,
  sortStudentQuestions,
} from '@/components/questions/student-question-rows';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import { listOwnQuestions } from '@/modules/questions/service';
import { NoRecord } from '../../_components';
import { loadOwn } from '../../_load';

export const metadata: Metadata = { title: 'سؤال‌های من' };

/** S4 — my questions: new replies first, and when an answer usually comes (F8). */
export default async function MyQuestionsPage() {
  const { actor, student } = await loadOwn();
  if (!student) return <NoRecord />;
  const list = await listOwnQuestions(actor);
  const items = sortStudentQuestions(list.items);
  const now = new Date();
  return (
    <>
      <PageHead
        title="سؤال‌های من"
        sub={`${list.expectedResponseText} جواب می‌گیری.`}
        actions={
          <Link
            href="/my/questions/new"
            className={buttonClass({ variant: 'primary', className: 'max-md:w-full' })}
          >
            <Icon name="plus" size={16} />
            سؤال جدید
          </Link>
        }
      />
      <Card aria-label="فهرست سؤال‌ها">
        {items.length ? (
          <StudentQuestionRows
            items={items}
            expectedResponseText={list.expectedResponseText}
            now={now}
          />
        ) : (
          <EmptyState
            icon="chat"
            tone="brand"
            title="هنوز سؤالی نپرسیده‌ای"
            headingLevel={2}
            action={
              <Link href="/my/questions/new" className={buttonClass({ variant: 'soft' })}>
                <Icon name="plus" size={16} />
                اولین سؤال
              </Link>
            }
          >
            هر جا گیر کردی، از همین‌جا بپرس. جواب مشاورت همین‌جا می‌آید.
          </EmptyState>
        )}
      </Card>
    </>
  );
}
