import Link from 'next/link';
import { faNumber } from '@/components/format/fa';
import { formatJalaliLong } from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/states';
import type { CheckinDTO } from '@/modules/checkins/contracts';

const MOOD_WORD: Record<number, string> = {
  1: 'خیلی بد',
  2: 'بد',
  3: 'معمولی',
  4: 'خوب',
  5: 'عالی',
};

/** Staff view of the weekly check-ins of one student (newest week first). */
export function CheckinList({ items, firstName }: { items: CheckinDTO[]; firstName: string }) {
  if (!items.length) {
    return (
      <EmptyState icon="checkin" title="هنوز check-in نفرستاده" className="py-5">
        {`check-inهای هفتگی ${firstName} (حال، مانع، برنامه‌ی هفته‌ی بعد) این‌جا می‌آید.`}
      </EmptyState>
    );
  }
  return (
    <ul className="-mx-4 md:-mx-5">
      {items.map((c) => (
        <li key={c.id} className="border-t border-line px-4 py-3 first:border-t-0 md:px-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong className="font-semibold text-fg">{`هفته‌ی ${formatJalaliLong(c.weekStart)}`}</strong>
            <span
              className={cn(
                'rounded-full px-2 py-[3px] text-xs leading-4 font-bold',
                c.mood <= 2 ? 'bg-h-red-bg text-h-red-fg' : 'bg-surface-2 text-fg-2',
              )}
            >
              {`حال ${faNumber(c.mood)} از ۵ · ${MOOD_WORD[c.mood] ?? ''}`}
            </span>
            {c.needsHelp ? (
              <Tag variant="late" icon="chat">
                کمک خواست
              </Tag>
            ) : null}
          </div>
          <dl className="mt-1.5 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            {(
              [
                ['این هفته', c.activityText],
                ['مانع', c.blocker],
                ['هفته‌ی بعد', c.nextWeekPlan],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-3">{k}</dt>
                  <dd dir="auto" className="m-0 whitespace-pre-line text-fg-2">
                    {v}
                  </dd>
                </div>
              ))}
          </dl>
          {c.questionId ? (
            <Link
              href={`/questions/${c.questionId}`}
              className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
            >
              سؤال ساخته‌شده
              <Icon name="chev-next" size={14} />
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
