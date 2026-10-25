'use client';

import { type FormEvent, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { ImageUploadField, useImageUploads } from '@/components/files/image-uploads';
import { todayDay } from '@/components/format/jalali';
import { cleanDecimal } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { JalaliDateField } from '@/components/ui/jalali-date-field';
import { Alert } from '@/components/ui/states';
import type { MilestoneTypeDTO } from '@/modules/catalog/contracts';

type Field =
  | 'typeId'
  | 'occurredOn'
  | 'platformId'
  | 'amount'
  | 'currency'
  | 'evidenceText'
  | 'form';

const PAST_SHORTCUTS = [
  { label: 'امروز', days: 0 },
  { label: 'دیروز', days: -1 },
  { label: 'هفته‌ی پیش', days: -7 },
];

/**
 * A milestone (F9). Student mode = a proposal with evidence (image or text) that staff
 * approve; staff mode = recorded directly as approved. Amount and currency are optional.
 * `status` is never sent (T-ESC).
 */
export function MilestoneForm({
  mode,
  studentId,
  types,
  platforms,
  onDone,
  onCancel,
}: {
  mode: 'student' | 'staff';
  studentId?: string;
  types: MilestoneTypeDTO[];
  platforms: Array<{ id: string; name: string }>;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const uploads = useImageUploads();
  const today = todayDay();
  const [typeId, setTypeId] = useState('');
  const [occurredOn, setOccurredOn] = useState(today);
  const [platformId, setPlatformId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [evidence, setEvidence] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [sending, setSending] = useState(false);
  const type = types.find((t) => t.id === typeId);
  const student = mode === 'student';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const next: Partial<Record<Field, string>> = {};
    if (!typeId) next.typeId = 'نوع نقطه‌ی عطف را انتخاب کن.';
    if (!occurredOn) next.occurredOn = 'تاریخ را بنویس.';
    else if (occurredOn > today) next.occurredOn = 'تاریخ نباید در آینده باشد.';
    const money = amount.trim() ? cleanDecimal(amount) : null;
    if (amount.trim() && money === null) next.amount = 'مبلغ را به عدد بنویس (مثلاً ۲۵۰).';
    if (money && !/^[A-Za-z]{3}$/.test(currency.trim()))
      next.currency = 'کد ارز سه‌حرفی است (مثلاً USD).';
    if (student && type?.requiresEvidence && !evidence.trim() && uploads.ids.length === 0)
      next.evidenceText = 'برای این نوع، تصویر یا توضیح مدرک لازم است.';
    if (uploads.busy) next.form = 'صبر کن آپلود تصویرها تمام شود.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSending(true);
    const url = student ? '/api/v1/me/milestones' : `/api/v1/students/${studentId}/milestones`;
    const res = await apiPost(url, {
      typeId,
      occurredOn,
      ...(platformId ? { platformId } : {}),
      ...(money ? { amount: money, currency: currency.trim().toUpperCase() } : {}),
      ...(evidence.trim() ? { evidenceText: evidence.trim() } : {}),
      ...(uploads.ids.length ? { attachmentIds: uploads.ids } : {}),
    });
    setSending(false);
    if (res.ok) {
      onDone();
      return;
    }
    const f = res.error.fields;
    const fieldErrors: Partial<Record<Field, string>> = {
      typeId: f.typeId,
      occurredOn: f.occurredOn,
      platformId: f.platformId,
      amount: f.amount,
      currency: f.currency,
      evidenceText: f.evidenceText ?? f.attachmentIds,
    };
    const has = Object.values(fieldErrors).some(Boolean);
    setErrors({
      ...fieldErrors,
      form: has
        ? undefined
        : res.error.status === 409
          ? 'این نقطه‌ی عطف قبلاً برای این هنرجو تأیید شده است.'
          : res.error.message,
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label={student ? 'ثبت خبر خوب' : 'ثبت نقطه‌ی عطف'}>
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      <SelectField
        label="چه اتفاقی افتاد؟"
        value={typeId}
        onChange={(e) => setTypeId(e.target.value)}
        error={errors.typeId}
        hint={
          type?.requiresEvidence
            ? 'این نوع مدرک لازم دارد: تصویر بی‌نام یا چند خط توضیح.'
            : undefined
        }
      >
        <option value="">انتخاب کن…</option>
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectField>
      <JalaliDateField
        label="کی؟"
        value={occurredOn}
        onChange={setOccurredOn}
        max={today}
        shortcuts={PAST_SHORTCUTS}
        error={errors.occurredOn}
      />
      <SelectField
        label="پلتفرم"
        optional
        value={platformId}
        onChange={(e) => setPlatformId(e.target.value)}
        error={errors.platformId}
      >
        <option value="">—</option>
        {platforms.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
        <TextField
          label="مبلغ"
          optional
          inputMode="decimal"
          dir="ltr"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
        />
        <TextField
          label="ارز"
          dir="ltr"
          value={currency}
          maxLength={3}
          onChange={(e) => setCurrency(e.target.value)}
          error={errors.currency}
        />
      </div>
      <TextareaField
        label={student ? 'مدرک یا توضیح' : 'توضیح'}
        optional={!type?.requiresEvidence || !student}
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        error={errors.evidenceText}
        className="min-h-24"
        maxLength={2000}
        hint={
          student
            ? 'مثلاً «قرارداد ساعتی ۲۰ دلار با یک فروشگاه Shopify». نام کارفرما را ننویس.'
            : undefined
        }
      />
      {student ? <ImageUploadField label="تصویر مدرک (اختیاری)" state={uploads} /> : null}
      <DialogActions>
        {onCancel ? <Button onClick={onCancel}>انصراف</Button> : null}
        <Button type="submit" variant="primary" loading={sending}>
          <Icon name="award" size={16} />
          {student ? 'فرستادن برای تأیید' : 'ثبت (تأییدشده)'}
        </Button>
      </DialogActions>
    </form>
  );
}
