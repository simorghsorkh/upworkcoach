'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { apiPatch, apiPost } from '@/components/api/client';
import { faNumber, faTime } from '@/components/format/fa';
import { todayDay } from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Rating } from '@/components/ui/choice';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { TextareaField } from '@/components/ui/field';
import { JalaliDateField } from '@/components/ui/jalali-date-field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type {
  ReviewInput,
  ReviewOutcome,
  StaffReviewDTO,
  StaffTaskDetailDTO,
} from '@/modules/tasks/contracts';
import { FEEDBACK_TEMPLATE } from './labels';

type Draft = { outcome: ReviewOutcome | null; feedback: string; score: number | null };

const draftKey = (submissionId: string) => `uc:review-draft:${submissionId}`;

function readDraft(submissionId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(submissionId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/**
 * M6 «بازبینی شما» (mockups/task-detail.html #review): outcome (accepted / changes), Persian
 * feedback with the mentor template (verdict, strength, ≤ 3 fixes, next step), optional score.
 * The draft stays on this device until it is sent. `POST /submissions/:id/review`.
 */
export function ReviewForm({
  submissionId,
  version,
  studentFirstName,
  scoreLabel = 'امتیاز این کار',
  nextHref,
  onReviewed,
}: {
  submissionId: string;
  version: number;
  studentFirstName: string;
  scoreLabel?: string;
  /** Where «ثبت بازبینی و رفتن به بعدی» goes (next item in the queue, or «امروز»). */
  nextHref?: string | null;
  onReviewed?: (task: StaffTaskDetailDTO) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const outcomeName = useId();
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [feedback, setFeedback] = useState(FEEDBACK_TEMPLATE);
  const [score, setScore] = useState<number | null>(null);
  /** «مهلت نسخه‌ی بعد» (sprint-3 gap 3): only with «نیاز به اصلاح»; '' = keep the deadline. */
  const [nextDue, setNextDue] = useState('');
  const [errors, setErrors] = useState<{
    outcome?: string;
    feedback?: string;
    nextDue?: string;
    form?: string;
  }>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const d = readDraft(submissionId);
    if (d) {
      setOutcome(d.outcome);
      setFeedback(d.feedback);
      setScore(d.score);
    }
    loaded.current = true;
  }, [submissionId]);

  // Autosave (debounced) so a closed tab never loses a long review.
  // biome-ignore lint/correctness/useExhaustiveDependencies: save on content change only
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => saveDraft(false), 800);
    return () => clearTimeout(t);
  }, [outcome, feedback, score]);

  function saveDraft(announce: boolean) {
    try {
      if (!outcome && feedback === FEEDBACK_TEMPLATE && score === null) {
        window.localStorage.removeItem(draftKey(submissionId));
        return;
      }
      window.localStorage.setItem(
        draftKey(submissionId),
        JSON.stringify({ outcome, feedback, score } satisfies Draft),
      );
      if (announce || savedAt) setSavedAt(new Date());
    } catch {
      // storage full or disabled: the form still works
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const next: typeof errors = {};
    if (!outcome) next.outcome = 'نتیجه را انتخاب کن: پذیرفته یا نیاز به اصلاح.';
    const text = feedback.trim();
    if (!text || text === FEEDBACK_TEMPLATE.trim()) next.feedback = 'بازخورد را بنویس.';
    if (next.outcome || next.feedback) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const body: ReviewInput = { outcome: outcome as ReviewOutcome, feedbackText: text };
    if (score !== null) body.score = score;
    if (outcome === 'changes_requested' && nextDue) body.nextDueDate = nextDue;
    const res = await apiPost<StaffTaskDetailDTO>(
      `/api/v1/submissions/${submissionId}/review`,
      body,
    );
    setSubmitting(false);
    if (res.ok) {
      try {
        window.localStorage.removeItem(draftKey(submissionId));
      } catch {
        // ignore
      }
      toast.show({
        message:
          outcome === 'accepted'
            ? `کار ${studentFirstName} پذیرفته شد.`
            : `بازخورد برای ${studentFirstName} رفت؛ نسخه‌ی بعد را می‌فرستد.`,
      });
      onReviewed?.(res.data);
      if (nextHref) router.push(nextHref);
      else router.refresh();
      return;
    }
    const { error } = res;
    if (error.fields.feedbackText) setErrors({ feedback: error.fields.feedbackText });
    else if (error.fields.nextDueDate) setErrors({ nextDue: error.fields.nextDueDate });
    else if (error.status === 409) setErrors({ form: `${error.message} صفحه را تازه کن.` });
    else setErrors({ form: error.message });
  }

  const outcomeCard = (
    value: ReviewOutcome,
    title: string,
    desc: string,
    icon: 'check' | 'undo',
    tone: 'ok' | 'fix',
  ) => {
    const checked = outcome === value;
    return (
      <label
        className={cn(
          'grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-md border px-4 py-3 transition-colors',
          'has-[input:focus-visible]:shadow-ring',
          checked
            ? tone === 'ok'
              ? 'border-h-green-fg bg-h-green-bg shadow-[inset_0_0_0_1px_var(--h-green-fg)]'
              : 'border-h-yellow-fg bg-h-yellow-bg shadow-[inset_0_0_0_1px_var(--h-yellow-fg)]'
            : 'border-line-2 bg-surface hover:border-line-strong',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'row-span-2 grid size-9 place-items-center rounded-[10px]',
            tone === 'ok' ? 'bg-h-green-bg text-h-green-fg' : 'bg-h-yellow-bg text-h-yellow-fg',
          )}
        >
          <Icon name={icon} size={20} />
        </span>
        <span className="text-md font-bold">{title}</span>
        <input
          type="radio"
          name={outcomeName}
          value={value}
          checked={checked}
          onChange={() => setOutcome(value)}
          className="col-start-3 row-span-2 row-start-1 size-[18px] accent-primary"
        />
        <span className="col-start-2 text-xs text-fg-3">{desc}</span>
      </label>
    );
  };

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="h-rv">
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      <fieldset className="mb-5">
        <legend className="mb-1.5 text-ui font-semibold">نتیجه</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {outcomeCard('accepted', 'پذیرفته', 'کار بسته می‌شود', 'check', 'ok')}
          {outcomeCard(
            'changes_requested',
            'نیاز به اصلاح',
            `نسخه‌ی ${faNumber(version + 1)} را می‌فرستد`,
            'undo',
            'fix',
          )}
        </div>
        {errors.outcome ? (
          <p
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-h-red-fg"
          >
            <Icon name="alert" size={16} />
            {errors.outcome}
          </p>
        ) : null}
      </fieldset>
      <TextareaField
        label={
          <span className="inline-flex flex-wrap items-center gap-2">
            بازخورد
            <span className="font-normal text-fg-3">(فارسی؛ جمله‌ی نمونه به انگلیسی)</span>
            <Tag variant="gate" icon="eye">
              هنرجو این را می‌بیند
            </Tag>
          </span>
        }
        // RTL, not auto: template lines such as «- » and «1. » have no strong character.
        dir="rtl"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        error={errors.feedback}
        className="min-h-[240px]"
        hint={
          <>
            <Icon name="info" size={16} className="mt-0.5 flex-none" />
            حداکثر ۳ اصلاح؛ کل متن را بازنویسی نکن.
          </>
        }
      />
      {outcome === 'changes_requested' ? (
        <JalaliDateField
          label="مهلت نسخه‌ی بعد"
          optional
          value={nextDue}
          onChange={setNextDue}
          min={todayDay()}
          shortcuts={[
            { label: 'فردا', days: 1 },
            { label: '۳ روز', days: 3 },
            { label: '۱ هفته', days: 7 },
          ]}
          extraShortcut={{
            label: 'بدون تغییر',
            pressed: nextDue === '',
            onSelect: () => setNextDue(''),
          }}
          error={errors.nextDue}
          hint="خالی بماند، مهلت فعلی سر جایش می‌ماند. این تمدید حساب نمی‌شود."
        />
      ) : null}
      <Rating
        legend={
          <>
            {scoreLabel} <span className="font-normal text-fg-3">(اختیاری)</span>
          </>
        }
        value={score}
        onChange={setScore}
      />
      <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-4 pt-3 pb-3 md:static md:mx-0 md:border-0 md:px-0 md:pb-0">
        <span
          className="me-auto inline-flex items-center gap-1 text-xs text-fg-3"
          aria-live="polite"
        >
          {savedAt ? (
            <>
              <Icon name="check" size={14} />
              {`پیش‌نویس ذخیره شد · ${faTime(savedAt)}`}
            </>
          ) : null}
        </span>
        <Button onClick={() => saveDraft(true)} className="max-md:hidden">
          ذخیره‌ی پیش‌نویس
        </Button>
        <Button type="submit" variant="primary" loading={submitting} className="max-md:flex-1">
          {nextHref ? 'ثبت بازبینی و رفتن به بعدی' : 'ثبت بازبینی'}
          <Icon name="chev-next" size={16} />
        </Button>
      </div>
    </form>
  );
}

/** «ویرایش بازخورد» within 24 h (only when `review.editable`). `PATCH /reviews/:id`. */
export function EditReviewButton({ review }: { review: StaffReviewDTO }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(review.feedbackText);
  const [score, setScore] = useState<number | null>(review.score);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) {
      setError('بازخورد را بنویس.');
      return;
    }
    setSubmitting(true);
    const res = await apiPatch<StaffReviewDTO>(`/api/v1/reviews/${review.id}`, {
      feedbackText: text.trim(),
      score,
    });
    setSubmitting(false);
    if (res.ok) {
      setOpen(false);
      toast.show({ message: 'بازخورد به‌روز شد.' });
      router.refresh();
      return;
    }
    setError(
      res.error.status === 409
        ? 'از ۲۴ ساعت گذشته و بازخورد دیگر قابل ویرایش نیست.'
        : (res.error.fields.feedbackText ?? res.error.message),
    );
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="pen" size={14} />
        ویرایش بازخورد
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="ویرایش بازخورد"
        description="تا ۲۴ ساعت پس از ثبت؛ نتیجه عوض نمی‌شود."
      >
        <form noValidate onSubmit={onSubmit}>
          {error ? <Alert tone="error" role="alert" title={error} /> : null}
          <TextareaField
            label="بازخورد"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[200px]"
          />
          <Rating legend="امتیاز (اختیاری)" value={score} onChange={setScore} />
          <DialogActions>
            <Button onClick={() => setOpen(false)}>انصراف</Button>
            <Button type="submit" variant="primary" loading={submitting}>
              ذخیره
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
