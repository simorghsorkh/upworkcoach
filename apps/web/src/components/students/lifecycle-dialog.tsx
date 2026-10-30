'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPut } from '@/components/api/client';
import { addDaysTo, formatJalaliLong, todayDay } from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { TextareaField } from '@/components/ui/field';
import { JalaliDateField } from '@/components/ui/jalali-date-field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { LifecycleStatus } from '@/modules/students/contracts';

const RETURN_SHORTCUTS = [
  { label: '۲ هفته', days: 14 },
  { label: '۱ ماه', days: 30 },
  { label: '۲ ماه', days: 60 },
];

/**
 * "Pause (with a return date)" (progress-tracking §7-1, user-flows §7 D3): the student gets
 * the status "Paused" and no alerts; the day before the return a reminder is created and on
 * that day they come back automatically. For a paused student: "Back to active" now.
 */
export function LifecycleDialog({
  studentId,
  firstName,
  status,
  pausedUntil,
  open,
  onClose,
}: {
  studentId: string;
  firstName: string;
  status: LifecycleStatus;
  pausedUntil: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const paused = status === 'paused';
  const [until, setUntil] = useState(addDaysTo(todayDay(), 30));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<{ until?: string; form?: string }>({});
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (!paused && !until) {
      setError({ until: 'تاریخ بازگشت را بنویس.' });
      return;
    }
    setSending(true);
    setError({});
    const res = await apiPut(`/api/v1/students/${studentId}/lifecycle`, {
      status: paused ? 'active' : 'paused',
      ...(paused ? {} : { pausedUntil: until }),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setSending(false);
    if (res.ok) {
      onClose();
      setReason('');
      toast.show({
        message: paused
          ? `${firstName} دوباره فعال شد.`
          : `${firstName} تا ${formatJalaliLong(until)} متوقف شد.`,
      });
      router.refresh();
      return;
    }
    setError({
      until: res.error.fields.pausedUntil,
      form: res.error.fields.pausedUntil ? undefined : res.error.message,
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={paused ? `بازگشت ${firstName} به فعال` : `توقف موقت ${firstName}`}
      description={
        paused
          ? pausedUntil
            ? `قرار بود ${formatJalaliLong(pausedUntil)} برگردد؛ می‌توانی همین حالا فعالش کنی.`
            : undefined
          : 'در این مدت هشدار نمی‌گیرد و در فهرست گیرکرده‌ها نمی‌آید. یک روز پیش از بازگشت یادآور می‌گیری.'
      }
    >
      <form noValidate onSubmit={onSubmit}>
        {error.form ? <Alert tone="error" role="alert" title={error.form} /> : null}
        {paused ? null : (
          <JalaliDateField
            label="تاریخ بازگشت"
            value={until}
            onChange={setUntil}
            min={addDaysTo(todayDay(), 1)}
            shortcuts={RETURN_SHORTCUTS}
            error={error.until}
          />
        )}
        <TextareaField
          label="دلیل"
          optional
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-[76px]"
          maxLength={500}
          placeholder={paused ? undefined : 'مثلاً امتحان‌های پایان ترم'}
        />
        <DialogActions>
          <Button onClick={onClose}>انصراف</Button>
          <Button type="submit" variant="primary" loading={sending}>
            <Icon name={paused ? 'refresh' : 'pause'} size={16} />
            {paused ? 'فعال کن' : 'متوقف کن'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
