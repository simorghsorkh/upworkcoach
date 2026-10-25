'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { toLatinDigits } from '@/components/format/fa';
import { formatJalaliLong, todayDay } from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { type PickedStudent, StudentPicker } from '@/components/students/student-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { JalaliDateField } from '@/components/ui/jalali-date-field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { tehranDateTime } from '@/lib/tehran-day';
import type { ReminderDTO } from '@/modules/reminders/contracts';

export type OwnerOption = { id: string; label: string };

const SHORTCUTS = [
  { label: 'فردا', days: 1 },
  { label: '۳ روز', days: 3 },
  { label: '۱ هفته', days: 7 },
];

/** «۱۰:۳۰» / «10:30» → [10, 30]; null when not a valid time. */
function parseTime(text: string): [number, number] | null {
  const m = /^(\d{1,2})[:٫.](\d{2})$/.exec(toLatinDigits(text.trim()));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? [h, min] : null;
}

/**
 * «یادآور» sheet (mockups/today.html #reminder, F6): student (optional), what, when (Jalali day
 * + optional time; without a time it is 09:00 Tehran), and for an admin «برای» any mentor.
 * `POST /api/v1/reminders`.
 */
export function ReminderForm({
  student,
  owners,
  viewerId,
  onDone,
  onCancel,
}: {
  student?: PickedStudent | null;
  /** Admin only: active staff to assign to; empty = always the viewer. */
  owners: OwnerOption[];
  viewerId: string;
  onDone: (reminder: ReminderDTO) => void;
  onCancel: () => void;
}) {
  const today = todayDay();
  const [picked, setPicked] = useState<PickedStudent[]>(student ? [student] : []);
  const [text, setText] = useState('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [ownerId, setOwnerId] = useState(viewerId);
  const [errors, setErrors] = useState<Partial<Record<'text' | 'day' | 'time' | 'form', string>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const next: typeof errors = {};
    if (!text.trim()) next.text = 'متن یادآور را بنویس.';
    if (!day) next.day = 'روز یادآور را انتخاب کن.';
    const t = time.trim() ? parseTime(time) : null;
    if (time.trim() && !t) next.time = 'ساعت را به شکل ۱۰:۳۰ بنویس.';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    // Wire shape of CreateReminderInput (dueAt travels as an ISO string).
    const body: Record<string, string> = { text: text.trim() };
    if (t) body.dueAt = tehranDateTime(day, t[0], t[1]).toISOString();
    else body.dueDate = day;
    if (picked[0]) body.studentId = picked[0].id;
    if (owners.length && ownerId !== viewerId) body.ownerId = ownerId;
    const res = await apiPost<ReminderDTO>('/api/v1/reminders', body);
    setSubmitting(false);
    if (res.ok) {
      onDone(res.data);
      return;
    }
    const f = res.error.fields;
    setErrors({
      text: f.text,
      day: f.dueDate ?? f.dueAt,
      form:
        f.text || f.dueDate || f.dueAt
          ? undefined
          : (f.studentId ?? f.ownerId ?? res.error.message),
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label="یادآور تازه">
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      {student ? (
        <p className="mb-5 text-ui text-fg-2">
          درباره‌ی <strong className="text-fg">{student.displayName}</strong>
        </p>
      ) : (
        <StudentPicker label="هنرجو (اختیاری)" value={picked} onChange={setPicked} />
      )}
      <TextField
        label="چه چیزی؟"
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={errors.text}
        maxLength={300}
        placeholder="مثلاً: بپرس مصاحبه چه شد"
      />
      <JalaliDateField
        label="کی؟"
        value={day}
        onChange={setDay}
        min={today}
        shortcuts={SHORTCUTS}
        error={errors.day}
      />
      <TextField
        label="ساعت"
        optional
        inputMode="numeric"
        dir="ltr"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        error={errors.time}
        placeholder="۹:۰۰"
        hint={day ? `بدون ساعت: ${formatJalaliLong(day)} ساعت ۹ صبح` : 'بدون ساعت: ۹ صبح همان روز'}
        className="max-w-[160px]"
      />
      {owners.length ? (
        <SelectField
          label="برای"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          hint="فقط مدیر می‌تواند برای مشاور دیگری یادآور بگذارد."
        >
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id === viewerId ? 'خودم' : o.label}
            </option>
          ))}
        </SelectField>
      ) : null}
      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          ثبت یادآور
        </Button>
      </DialogActions>
    </form>
  );
}

export function ReminderDialog({
  open,
  onClose,
  student,
  owners,
  viewerId,
}: {
  open: boolean;
  onClose: () => void;
  student?: PickedStudent | null;
  owners: OwnerOption[];
  viewerId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  return (
    <Dialog open={open} onClose={onClose} title="یادآور">
      <ReminderForm
        student={student}
        owners={owners}
        viewerId={viewerId}
        onCancel={onClose}
        onDone={(r) => {
          onClose();
          toast.show({
            message: `یادآور برای ${formatJalaliLong(todayDay(new Date(r.dueAt)))} ثبت شد.`,
          });
          router.refresh();
        }}
      />
    </Dialog>
  );
}

/** Button + reminder sheet; `initiallyOpen` follows `?new=1`. */
export function ReminderButton({
  student,
  owners,
  viewerId,
  label = 'یادآور',
  variant = 'secondary',
  size,
  initiallyOpen,
  className,
}: {
  student?: PickedStudent | null;
  owners: OwnerOption[];
  viewerId: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'soft';
  size?: 'sm' | 'md';
  initiallyOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(Boolean(initiallyOpen));
  useEffect(() => {
    if (initiallyOpen) setOpen(true);
  }, [initiallyOpen]);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={className}
      >
        <Icon name="bell" size={16} />
        {label}
      </Button>
      <ReminderDialog
        open={open}
        onClose={() => setOpen(false)}
        student={student}
        owners={owners}
        viewerId={viewerId}
      />
    </>
  );
}
