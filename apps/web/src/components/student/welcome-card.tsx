'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons/icon';
import { buttonClass } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';

export type WelcomeStep = { label: string; href: string; minutes: number; done: boolean };

const KEY = 'uc:welcome-dismissed';

/**
 * S1a "Welcome" (user-flows §1, mockups/student-home.html `.welcome`): three short steps to a
 * first small win; the next one is highlighted. Hidden once every step is done or the
 * student closes it (remembered on this device).
 */
export function WelcomeCard({ firstName, steps }: { firstName: string; steps: WelcomeStep[] }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === '1') setHidden(true);
    } catch {
      // ignore
    }
  }, []);
  if (hidden) return null;
  const next = steps.find((s) => !s.done);
  if (!next) return null;
  return (
    <section
      aria-labelledby="h-welcome"
      className="relative overflow-hidden rounded-lg border border-primary-line bg-surface p-5 shadow-md md:p-6"
    >
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          try {
            window.localStorage.setItem(KEY, '1');
          } catch {
            // ignore
          }
        }}
        aria-label="بستن کارت خوش‌آمد"
        className="absolute end-2 top-2 inline-grid size-9 cursor-pointer place-items-center rounded-sm text-fg-2 hover:bg-surface-2"
      >
        <Icon name="x" size={18} />
      </button>
      <h2 id="h-welcome" className="mb-1 text-[20px] leading-[30px]">
        {`خوش آمدی ${firstName}`}
      </h2>
      <p className="text-sm text-fg-2">
        این‌جا دفتر کار تو با مشاورت است: کارهایت، بازخوردها و جواب سؤال‌هایت. برای شروع سه قدم کوتاه:
      </p>
      <ol className="my-4 flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={cn(
                'flex items-center gap-3 rounded-md border border-line bg-bg p-3 text-sm text-fg hover:border-primary-line',
                s.done && 'text-fg-3',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-7 flex-none place-items-center rounded-full border-[1.5px] text-[13px] font-extrabold',
                  s.done
                    ? 'border-h-green-bd bg-h-green-bg text-h-green-fg'
                    : s === next
                      ? 'border-primary bg-primary text-on-brand'
                      : 'border-line-2 bg-surface text-fg-2',
                )}
              >
                {s.done ? <Icon name="check" size={14} /> : ['۱', '۲', '۳', '۴'][i]}
              </span>
              <span className={cn('min-w-0 flex-1', s === next && 'font-bold')}>
                {s.done ? <span className="sr-only">انجام شد: </span> : null}
                {s.label}
              </span>
              <span className="text-xs whitespace-nowrap text-fg-3">{`${['۱', '۲', '۳', '۴', '۵'][s.minutes - 1] ?? s.minutes} دقیقه`}</span>
            </Link>
          </li>
        ))}
      </ol>
      <Link
        href={next.href}
        className={buttonClass({ variant: 'primary', size: 'lg', block: true })}
      >
        {steps.indexOf(next) === 0 ? 'شروع قدم اول' : 'قدم بعدی'}
        <Icon name="next" size={16} />
      </Link>
    </section>
  );
}
