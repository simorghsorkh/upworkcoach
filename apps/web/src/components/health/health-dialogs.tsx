'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiDelete, apiPost, apiPut } from '@/components/api/client';
import { faDayMonth } from '@/components/format/fa';
import { addDaysTo, formatJalaliLong, todayDay } from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { RadioCards } from '@/components/ui/choice';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { TextareaField } from '@/components/ui/field';
import { JalaliDateField } from '@/components/ui/jalali-date-field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { FlagCategory, FlagDTO, FlagLevel } from '@/modules/health/contracts';
import { flagCategoryLabel } from './reasons';

const SNOOZE_SHORTCUTS = [
  { label: '۳ روز', days: 3 },
  { label: '۱ هفته', days: 7 },
  { label: '۲ هفته', days: 14 },
];

/**
 * «خاموش کردن هشدار تا تاریخ…» (user-flows §7, mockups #mute): the student stays computed but
 * leaves «امروز» and the stuck list until the end of that Tehran day. With an active snooze
 * the same dialog offers «روشن کردن دوباره».
 */
export function SnoozeDialog({
  studentId,
  firstName,
  snoozedUntil,
  open,
  onClose,
}: {
  studentId: string;
  firstName: string;
  snoozedUntil: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const tomorrow = addDaysTo(todayDay(), 1);
  const [until, setUntil] = useState(addDaysTo(todayDay(), 7));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ until?: string; reason?: string; form?: string }>({});
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (!until) next.until = 'تاریخ را بنویس.';
    if (!reason.trim()) next.reason = 'دلیل را بنویس (مثلاً «در سفر است»).';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy('save');
    const res = await apiPut(`/api/v1/students/${studentId}/health/snooze`, {
      until,
      reason: reason.trim(),
    });
    setBusy(null);
    if (res.ok) {
      onClose();
      setReason('');
      toast.show({ message: `هشدارهای ${firstName} تا ${formatJalaliLong(until)} خاموش شد.` });
      router.refresh();
      return;
    }
    setErrors({
      until: res.error.fields.until,
      reason: res.error.fields.reason,
      form: res.error.fields.until || res.error.fields.reason ? undefined : res.error.message,
    });
  }

  async function clear() {
    setBusy('clear');
    const res = await apiDelete(`/api/v1/students/${studentId}/health/snooze`);
    setBusy(null);
    if (res.ok) {
      onClose();
      toast.show({ message: 'هشدارها دوباره روشن شد.' });
      router.refresh();
      return;
    }
    setErrors({ form: res.error.message });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="خاموش کردن هشدار"
      description={`هشدارهای ${firstName} تا این تاریخ در «امروز» و فهرست گیرکرده‌ها نمی‌آیند؛ وضعیت همچنان حساب می‌شود.`}
    >
      <form noValidate onSubmit={onSubmit}>
        {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
        {snoozedUntil ? (
          <Alert
            tone="neutral"
            title={`الان تا ${faDayMonth(new Date(snoozedUntil))} خاموش است.`}
            action={
              <Button size="sm" loading={busy === 'clear'} onClick={() => void clear()}>
                <Icon name="bell" size={16} />
                روشن کردن دوباره
              </Button>
            }
          />
        ) : null}
        <JalaliDateField
          label="تا تاریخ"
          value={until}
          onChange={setUntil}
          min={tomorrow}
          shortcuts={SNOOZE_SHORTCUTS}
          error={errors.until}
        />
        <TextareaField
          label="دلیل"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          className="min-h-[76px]"
          placeholder="مثلاً در سفر است"
          maxLength={500}
        />
        <DialogActions>
          <Button onClick={onClose}>انصراف</Button>
          <Button type="submit" variant="primary" loading={busy === 'save'}>
            <Icon name="bell-off" size={16} />
            خاموش کن
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const CATEGORY_OPTIONS = (Object.entries(flagCategoryLabel) as Array<[FlagCategory, string]>).map(
  ([value, label]) => ({ value, label }),
);

/** «پرچم دستی» (R-FLAG): category, level, a note and an optional expiry day. */
export function FlagDialog({
  studentId,
  firstName,
  open,
  onClose,
}: {
  studentId: string;
  firstName: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [category, setCategory] = useState<FlagCategory>('personal');
  const [level, setLevel] = useState<FlagLevel>('yellow');
  const [note, setNote] = useState('');
  const [expires, setExpires] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    const res = await apiPost<FlagDTO>(`/api/v1/students/${studentId}/flags`, {
      category,
      level,
      note: note.trim() || null,
      expiresAt: expires || null,
    });
    setSending(false);
    if (res.ok) {
      onClose();
      setNote('');
      setExpires('');
      toast.show({ message: `پرچم برای ${firstName} ثبت شد.` });
      router.refresh();
      return;
    }
    setError(res.error.fields.expiresAt ?? res.error.fields.note ?? res.error.message);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`پرچم دستی برای ${firstName}`}
      description="برای موردهای خاصی که سیستم نمی‌بیند. هنرجو پرچم را نمی‌بیند."
    >
      <form noValidate onSubmit={onSubmit}>
        {error ? <Alert tone="error" role="alert" title={error} /> : null}
        <RadioCards
          legend="موضوع"
          value={category}
          onChange={setCategory}
          options={CATEGORY_OPTIONS}
          size="sm"
        />
        <RadioCards
          legend="شدت"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'yellow', label: 'زرد · نیاز به توجه' },
            { value: 'red', label: 'قرمز · گیرکرده' },
          ]}
        />
        <TextareaField
          label="یادداشت"
          optional
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[76px]"
          maxLength={1000}
        />
        <JalaliDateField
          label="خودکار برداشته شود در"
          optional
          value={expires}
          onChange={setExpires}
          min={addDaysTo(todayDay(), 1)}
          shortcuts={SNOOZE_SHORTCUTS}
          hint="خالی بگذاری، تا وقتی خودت برداری می‌ماند."
        />
        <DialogActions>
          <Button onClick={onClose}>انصراف</Button>
          <Button type="submit" variant="primary" loading={sending}>
            <Icon name="flag" size={16} />
            ثبت پرچم
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Active manual flags of the record with «برداشتن». */
export function FlagsList({ flags, viewerId }: { flags: FlagDTO[]; viewerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function clear(flag: FlagDTO) {
    setBusy(flag.id);
    setError(null);
    const res = await apiPost(`/api/v1/flags/${flag.id}/clear`);
    setBusy(null);
    if (res.ok) {
      toast.show({ message: 'پرچم برداشته شد.' });
      router.refresh();
      return;
    }
    setError(res.error.message);
  }

  return (
    <>
      {error ? <Alert tone="error" role="alert" title={error} /> : null}
      <ul className="flex flex-col gap-2">
        {flags.map((f) => (
          <li
            key={f.id}
            className={
              f.level === 'red'
                ? 'rounded-md border border-h-red-bd bg-h-red-bg px-3 py-2 text-h-red-fg'
                : 'rounded-md border border-h-yellow-bd bg-h-yellow-bg px-3 py-2 text-h-yellow-fg'
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <Icon name="flag" size={16} />
              <strong className="font-bold">{flagCategoryLabel[f.category]}</strong>
              <span className="text-xs">{f.level === 'red' ? 'قرمز' : 'زرد'}</span>
              <span className="ms-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === f.id}
                  onClick={() => void clear(f)}
                  aria-label={`برداشتن پرچم ${flagCategoryLabel[f.category]}`}
                >
                  برداشتن
                </Button>
              </span>
            </div>
            {f.note ? (
              <p dir="auto" className="mt-1 text-sm whitespace-pre-line text-fg">
                {f.note}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-fg-2">
              {`${f.createdBy.id === viewerId ? 'خودم' : f.createdBy.displayName} · ${faDayMonth(new Date(f.createdAt))}`}
              {f.expiresAt ? ` · تا ${faDayMonth(new Date(f.expiresAt))}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
