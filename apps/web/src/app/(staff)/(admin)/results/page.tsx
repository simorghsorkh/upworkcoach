import type { Metadata } from 'next';
import Link from 'next/link';
import { CsvDownloadButton } from '@/components/files/csv-download';
import { faNumber } from '@/components/format/fa';
import {
  dayToJalali,
  JALALI_MONTHS,
  jalaliMonthLength,
  jalaliToDay,
  todayDay,
} from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { getNorthStar } from '@/modules/milestones/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { param } from '../../_data';

export const metadata: Metadata = { title: 'نتایج' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `?m=1405-07` → that Jalali month; anything else → the current month (Tehran). */
function monthOf(raw: string): { jy: number; jm: number } {
  const m = /^(\d{4})-(\d{1,2})$/.exec(raw);
  if (m) {
    const jy = Number(m[1]);
    const jm = Number(m[2]);
    if (jm >= 1 && jm <= 12 && jy > 1300 && jy < 1500) return { jy, jm };
  }
  const t = dayToJalali(todayDay());
  return { jy: t.jy, jm: t.jm };
}

function shift({ jy, jm }: { jy: number; jm: number }, delta: number) {
  const i = jy * 12 + (jm - 1) + delta;
  return { jy: Math.floor(i / 12), jm: (i % 12) + 1 };
}

const key = (m: { jy: number; jm: number }) => `${m.jy}-${String(m.jm).padStart(2, '0')}`;

/**
 * M10 "Results" (admin, F9): two numbers and one median — approved North Star milestones in the
 * month and in total, and the median days from joining to the first one. Nothing more.
 */
export default async function ResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin']);
  const sp = await searchParams;
  const month = monthOf(param(sp.m));
  const from = jalaliToDay(month.jy, month.jm, 1) ?? todayDay();
  const to = jalaliToDay(month.jy, month.jm, jalaliMonthLength(month.jy, month.jm)) ?? todayDay();
  const ns = await getNorthStar(toActor(user), { from, to });
  const current = monthOf('');
  const isCurrent = current.jy === month.jy && current.jm === month.jm;
  const title = `${JALALI_MONTHS[month.jm - 1]} ${faNumber(month.jy)}`;

  return (
    <>
      <PageHead
        title="نتایج"
        sub="فقط نقاط عطف تأییدشده شمرده می‌شوند."
        actions={
          <CsvDownloadButton
            href="/api/v1/exports/milestones.csv"
            filename="milestones.csv"
            size="sm"
          >
            خروجی CSV نقاط عطف
          </CsvDownloadButton>
        }
      />
      <nav aria-label="ماه" className="mb-4 flex items-center gap-2">
        <Link
          href={`/results?m=${key(shift(month, -1))}`}
          className={buttonClass({ size: 'sm', variant: 'ghost' })}
          aria-label="ماه قبل"
        >
          <Icon name="chev-next" size={16} className="rotate-180" />
        </Link>
        <p className="min-w-32 text-center text-md font-bold" aria-live="polite">
          {title}
        </p>
        {isCurrent ? (
          <span className="size-9" />
        ) : (
          <Link
            href={`/results?m=${key(shift(month, 1))}`}
            className={buttonClass({ size: 'sm', variant: 'ghost' })}
            aria-label="ماه بعد"
          >
            <Icon name="chev-next" size={16} />
          </Link>
        )}
        {!isCurrent ? (
          <Link href="/results" className="text-sm font-semibold text-link hover:underline">
            ماه جاری
          </Link>
        ) : null}
      </nav>
      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        <Stat
          label={`اولین قرارداد تأییدشده در ${JALALI_MONTHS[month.jm - 1]}`}
          value={faNumber(ns.approvedInRange)}
          icon="award"
        />
        <Stat
          label="اولین قرارداد تأییدشده (تجمعی)"
          value={faNumber(ns.approvedTotal)}
          sub={`${faNumber(ns.studentsWithFirst)} هنرجو`}
          icon="chart"
        />
        <Stat
          label="میانه‌ی روز از ورود تا اولین قرارداد"
          value={
            ns.medianDaysToFirst === null
              ? '—'
              : `${faNumber(Math.round(ns.medianDaysToFirst))} روز`
          }
          sub={ns.medianDaysToFirst === null ? 'هنوز داده‌ای نیست' : undefined}
          icon="clock"
        />
      </div>
      {ns.pendingProposals ? (
        <Card className="mt-4">
          <p className="flex flex-wrap items-center gap-2 text-ui">
            <Icon name="hourglass" className="text-fg-3" />
            {`${faNumber(ns.pendingProposals)} پیشنهاد نقطه‌ی عطف منتظر تأیید است؛ در پرونده‌ی هر هنرجو بخش «نقاط عطف».`}
          </p>
        </Card>
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: 'award' | 'chart' | 'clock';
}) {
  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-semibold text-fg-2">
        <Icon name={icon} size={18} className="text-fg-3" />
        {label}
      </p>
      <p className="mt-2 text-kpi font-extrabold tabular-nums">{value}</p>
      {sub ? <p className="text-sm text-fg-3">{sub}</p> : null}
    </Card>
  );
}
