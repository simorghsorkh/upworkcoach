import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckinForm, MOOD_LABEL } from '@/components/checkins/checkin-form';
import { faDayTime, faNumber } from '@/components/format/fa';
import { formatJalaliLong } from '@/components/format/jalali';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { Alert, EmptyState } from '@/components/ui/states';
import type { CurrentCheckinDTO } from '@/modules/checkins/contracts';
import { getCurrentCheckin } from '@/modules/checkins/service';
import { ApiError } from '@/server/http/errors';
import { NoRecord } from '../../_components';
import { loadOwn } from '../../_load';

export const metadata: Metadata = { title: 'check-in هفتگی' };

/** S9 — the weekly check-in (Should; on by decision E5). 404 = turned off in settings. */
export default async function CheckinPage() {
  const { actor, student } = await loadOwn();
  if (!student) return <NoRecord />;
  let current: CurrentCheckinDTO | null = null;
  try {
    current = await getCurrentCheckin(actor);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
  const now = new Date();
  if (!current) {
    return (
      <>
        <PageHead title="check-in هفتگی" />
        <Card>
          <EmptyState icon="checkin" title="check-in فعلاً خاموش است" headingLevel={2}>
            هر وقت مربی‌ات روشنش کند، کارتش در خانه می‌آید.
          </EmptyState>
        </Card>
      </>
    );
  }
  const existing = current.existing;
  return (
    <>
      <PageHead
        title={
          <>
            <bdi>check-in</bdi> این هفته
          </>
        }
        sub={`هفته‌ی ${formatJalaliLong(current.weekStart)} · ۳ دقیقه`}
      />
      {existing ? (
        <Card aria-label="check-in فرستاده‌شده">
          <Alert tone="ok" title="check-in این هفته را فرستاده‌ای.">
            {`${faDayTime(new Date(existing.submittedAt), now)}. هفته‌ی بعد دوباره همین‌جا می‌آید.`}
          </Alert>
          <dl className="m-0 grid grid-cols-1 gap-y-1 text-ui md:grid-cols-[max-content_minmax(0,1fr)] md:gap-x-5 md:gap-y-2.5">
            {[
              ['این هفته', existing.activityText],
              ['مانع', existing.blocker],
              ['حال', `${faNumber(existing.mood)} از ۵ · ${MOOD_LABEL[existing.mood] ?? ''}`],
              ['هفته‌ی بعد', existing.nextWeekPlan],
              ['کمک خواستی؟', existing.needsHelp ? 'بله' : 'نه'],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-xs text-fg-3 md:text-ui">{k}</dt>
                <dd dir="auto" className="m-0 mb-3 min-w-0 font-medium whitespace-pre-line md:mb-0">
                  {v || <span className="text-fg-3">—</span>}
                </dd>
              </div>
            ))}
          </dl>
          {existing.questionId ? (
            <Link
              href={`/my/questions/${existing.questionId}`}
              className={buttonClass({ variant: 'soft', className: 'mt-4' })}
            >
              دیدن سؤالی که برای کمک ساخته شد
            </Link>
          ) : null}
        </Card>
      ) : (
        <Card aria-label="فرم check-in">
          {!current.open ? (
            <Alert tone="neutral" title="هنوز روز check-in نرسیده.">
              {`فرم این هفته ${faDayTime(new Date(current.opensAt), now)} باز می‌شود؛ اگر الان می‌خواهی، می‌توانی همین حالا بفرستی.`}
            </Alert>
          ) : null}
          <CheckinForm current={current} mentorName={student.mentor?.displayName ?? null} />
        </Card>
      )}
    </>
  );
}
