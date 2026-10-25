'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { Button, buttonClass } from '@/components/ui/button';
import { RadioCards } from '@/components/ui/choice';
import { TextareaField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import type { CheckinDTO, CurrentCheckinDTO } from '@/modules/checkins/contracts';

/** «حالت چطور است؟» — big buttons with a word, never a bare number (user-flows §9). */
export const MOOD_LABEL: Record<number, string> = {
  1: 'خیلی بد',
  2: 'بد',
  3: 'معمولی',
  4: 'خوب',
  5: 'عالی',
};

type Field = 'mood' | 'blocker' | 'form';

/**
 * S9 weekly check-in (progress-tracking.md §6-3, user-flows §9): five short questions in
 * about three minutes. «به کمک مشاور نیاز داری؟ بله» opens a question in the mentor's queue
 * with the blocker as its text (the backend does it in the same transaction).
 */
export function CheckinForm({
  current,
  mentorName,
}: {
  current: Pick<CurrentCheckinDTO, 'weekSummary'>;
  mentorName: string | null;
}) {
  const router = useRouter();
  const { tasksSubmitted, tasksAccepted } = current.weekSummary;
  const [activity, setActivity] = useState('');
  const [blocker, setBlocker] = useState('');
  const [mood, setMood] = useState<string>('');
  const [plan, setPlan] = useState('');
  const [help, setHelp] = useState<'no' | 'yes'>('no');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<CheckinDTO | null>(null);
  const mentor = mentorName ?? 'مشاورت';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const next: Partial<Record<Field, string>> = {};
    if (!mood) next.mood = 'حالت را از ۱ تا ۵ انتخاب کن.';
    if (help === 'yes' && !blocker.trim())
      next.blocker = `بنویس کجا گیر کرده‌ای تا ${mentor} بداند چه کمکی لازم است.`;
    setErrors(next);
    if (Object.keys(next).length) return;
    setSending(true);
    const res = await apiPost<CheckinDTO>('/api/v1/me/checkins', {
      activityText: activity.trim() || null,
      blocker: blocker.trim() || null,
      mood: Number(mood),
      nextWeekPlan: plan.trim() || null,
      needsHelp: help === 'yes',
    });
    setSending(false);
    if (res.ok) {
      setDone(res.data);
      router.refresh();
      return;
    }
    if (res.error.status === 409) {
      setErrors({ form: 'check-in این هفته را قبلاً فرستاده‌ای.' });
      router.refresh();
      return;
    }
    setErrors({
      mood: res.error.fields.mood,
      blocker: res.error.fields.blocker,
      form: res.error.fields.mood || res.error.fields.blocker ? undefined : res.error.message,
    });
  }

  if (done) {
    return (
      <div role="status">
        <Alert tone="ok" title="ثبت شد.">
          {`${mentor} شنبه مرورش می‌کند. هفته‌ی بعد دوباره همین‌جا می‌بینی‌اش.`}
        </Alert>
        {done.questionId ? (
          <p className="mb-4 text-ui text-fg-2">
            درخواست کمکت به‌صورت یک سؤال در صف مشاورت رفت.{' '}
            <Link href={`/my/questions/${done.questionId}`} className="font-semibold text-link">
              دیدن سؤال
            </Link>
          </p>
        ) : null}
        <Link href="/home" className={buttonClass({ variant: 'primary' })}>
          بازگشت به خانه
        </Link>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label="check-in هفتگی">
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      <p className="mb-2 rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg-2">
        <span className="font-semibold text-fg">از شنبه تا امروز: </span>
        {`${faNumber(tasksSubmitted)} تحویل · ${faNumber(tasksAccepted)} کار پذیرفته`}
      </p>
      <TextareaField
        label="۱. این هفته چه کار کردی؟"
        optional
        value={activity}
        onChange={(e) => setActivity(e.target.value)}
        className="min-h-24"
        placeholder={
          tasksSubmitted
            ? `${faNumber(tasksSubmitted)} کار تحویل دادم و …`
            : 'چند خط کوتاه کافی است.'
        }
        maxLength={2000}
      />
      <TextareaField
        label="۲. بزرگ‌ترین مانع این هفته چه بود؟"
        optional={help === 'no'}
        value={blocker}
        onChange={(e) => setBlocker(e.target.value)}
        error={errors.blocker}
        className="min-h-20"
        maxLength={1000}
      />
      <RadioCards
        legend="۳. حالت چطور است؟"
        value={mood}
        onChange={(v) => setMood(v)}
        error={errors.mood}
        options={[1, 2, 3, 4, 5].map((n) => ({
          value: String(n),
          label: (
            <span className="flex flex-col items-center leading-tight">
              <span className="text-md font-extrabold">{faNumber(n)}</span>
              <span className="text-xs">{MOOD_LABEL[n]}</span>
            </span>
          ),
          ariaLabel: `${faNumber(n)} از ۵، ${MOOD_LABEL[n]}`,
        }))}
        className="[&_label]:min-h-16 [&_label]:min-w-[60px] [&_label]:flex-1 [&_label]:justify-center [&_svg]:hidden"
      />
      <TextareaField
        label="۴. هفته‌ی بعد چه می‌کنی؟"
        optional
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
        className="min-h-20"
        maxLength={1000}
      />
      <RadioCards
        legend={`۵. به کمک ${mentor} نیاز داری؟`}
        value={help}
        onChange={setHelp}
        options={[
          { value: 'no', label: 'نه، فعلاً نه' },
          { value: 'yes', label: 'بله، کمک لازم دارم' },
        ]}
        hint={
          help === 'yes'
            ? `متن مانع به‌صورت یک سؤال به ${mentor} می‌رسد و جوابش در «سؤال‌ها» می‌آید.`
            : undefined
        }
      />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={sending} className="max-md:w-full">
          <Icon name="check" size={16} />
          ثبت check-in
        </Button>
      </div>
    </form>
  );
}
