'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPatch } from '@/components/api/client';
import { toLatinDigits } from '@/components/format/fa';
import { splitApiError } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { SelfStudentDTO } from '@/modules/students/contracts';
import { OPTIONS } from './labels';

type Values = {
  messengerHandle: string;
  primaryPlatformId: string;
  primarySkill: string;
  skillLevel: string;
  englishWriting: string;
  englishSpeaking: string;
  hoursPerWeek: string;
  incomeGoalUsd: string;
  goal90d: string;
  priorExperience: string;
  selfReportedBlocker: string;
};
type Field = keyof Values;
const FIELDS = [
  'messengerHandle',
  'primaryPlatformId',
  'primarySkill',
  'skillLevel',
  'englishWriting',
  'englishSpeaking',
  'hoursPerWeek',
  'incomeGoalUsd',
  'goal90d',
  'priorExperience',
  'selfReportedBlocker',
] as const satisfies readonly Field[];
const NUMERIC: ReadonlySet<Field> = new Set([
  'skillLevel',
  'englishWriting',
  'englishSpeaking',
  'hoursPerWeek',
  'incomeGoalUsd',
]);
const RANGE: Partial<Record<Field, [number, number]>> = {
  skillLevel: [1, 5],
  englishWriting: [1, 5],
  englishSpeaking: [1, 5],
  hoursPerWeek: [0, 168],
  incomeGoalUsd: [0, 10_000_000],
};

const str = (v: string | number | null) => (v === null ? '' : String(v));

function fromStudent(s: SelfStudentDTO): Values {
  return {
    messengerHandle: s.messengerHandle ?? '',
    primaryPlatformId: s.primaryPlatform?.id ?? '',
    primarySkill: s.primarySkill ?? '',
    skillLevel: str(s.skillLevel),
    englishWriting: str(s.englishWriting),
    englishSpeaking: str(s.englishSpeaking),
    hoursPerWeek: str(s.hoursPerWeek),
    incomeGoalUsd: str(s.incomeGoalUsd),
    goal90d: s.goal90d ?? '',
    priorExperience: s.priorExperience ?? '',
    selfReportedBlocker: s.selfReportedBlocker ?? '',
  };
}

const SCALE = [1, 2, 3, 4, 5].map((n) => [String(n), `${'۱۲۳۴۵'[n - 1]} از ۵`] as const);

/**
 * S7 "Edit my information" (`PATCH /me/student`): only the whitelist the student may change
 * about themself (data-model.md 2-3). Only changed fields are sent, with `ifUpdatedAt`.
 */
export function SelfEditButton({
  student,
  platforms,
  initiallyOpen,
}: {
  student: SelfStudentDTO;
  platforms: Array<{ id: string; name: string }>;
  initiallyOpen?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(Boolean(initiallyOpen));
  const [v, setV] = useState<Values>(() => fromStudent(student));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: Field) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const before = fromStudent(student);
    const body: Record<string, unknown> = {};
    const next: Partial<Record<Field, string>> = {};
    for (const k of FIELDS) {
      if (v[k].trim() === before[k].trim()) continue;
      const raw = v[k].trim();
      if (!raw) {
        body[k] = null;
        continue;
      }
      if (NUMERIC.has(k)) {
        const n = Number(toLatinDigits(raw));
        const [min, max] = RANGE[k] ?? [0, Number.MAX_SAFE_INTEGER];
        if (!Number.isInteger(n) || n < min || n > max) {
          next[k] = 'عدد معتبر بنویس.';
          continue;
        }
        body[k] = n;
      } else {
        body[k] = raw;
      }
    }
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    if (!Object.keys(body).length) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const res = await apiPatch('/api/v1/me/student', { ...body, ifUpdatedAt: student.updatedAt });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      toast.show({ message: 'اطلاعاتت ذخیره شد.' });
      router.refresh();
      return;
    }
    if (res.error.status === 409) {
      setFormError('این اطلاعات همین الان جای دیگری عوض شد. صفحه را تازه کن و دوباره بزن.');
      return;
    }
    const split = splitApiError(res.error, FIELDS);
    setErrors(split.fields);
    setFormError(split.form);
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        aria-haspopup="dialog"
        onClick={() => {
          setV(fromStudent(student));
          setErrors({});
          setFormError(null);
          setOpen(true);
        }}
      >
        <Icon name="pen" size={16} />
        ویرایش
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="ویرایش اطلاعات من">
        <form noValidate onSubmit={onSubmit}>
          {formError ? <Alert tone="error" role="alert" title={formError} /> : null}
          <TextareaField
            label="هدف ۹۰ روزه"
            optional
            value={v.goal90d}
            onChange={set('goal90d')}
            error={errors.goal90d}
            className="min-h-[76px]"
            hint="عددی و مشخص؛ مثلاً «تا ۳۰ آذر: ۶۰ ارسال، ۳ مصاحبه، اولین قرارداد»."
            maxLength={1000}
          />
          <TextField
            label="آیدی تلگرام یا پیام‌رسان"
            optional
            dir="ltr"
            value={v.messengerHandle}
            onChange={set('messengerHandle')}
            error={errors.messengerHandle}
            maxLength={100}
          />
          <SelectField
            label="پلتفرم اصلی"
            optional
            value={v.primaryPlatformId}
            onChange={set('primaryPlatformId')}
            error={errors.primaryPlatformId}
          >
            <option value="">—</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <div className="grid gap-x-3 md:grid-cols-[minmax(0,1fr)_140px]">
            <TextField
              label="مهارت اصلی"
              optional
              value={v.primarySkill}
              onChange={set('primarySkill')}
              error={errors.primarySkill}
              maxLength={120}
            />
            <SelectField
              label="سطح مهارت"
              optional
              value={v.skillLevel}
              onChange={set('skillLevel')}
              error={errors.skillLevel}
            >
              <option value="">—</option>
              {SCALE.map(([n, l]) => (
                <option key={n} value={n}>
                  {l}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <SelectField
              label="انگلیسی نوشتاری"
              optional
              value={v.englishWriting}
              onChange={set('englishWriting')}
              error={errors.englishWriting}
            >
              <option value="">—</option>
              {SCALE.map(([n, l]) => (
                <option key={n} value={n}>
                  {l}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="انگلیسی گفتاری"
              optional
              value={v.englishSpeaking}
              onChange={set('englishSpeaking')}
              error={errors.englishSpeaking}
            >
              <option value="">—</option>
              {SCALE.map(([n, l]) => (
                <option key={n} value={n}>
                  {l}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <TextField
              label="ساعت در هفته"
              optional
              inputMode="numeric"
              value={v.hoursPerWeek}
              onChange={set('hoursPerWeek')}
              error={errors.hoursPerWeek}
            />
            <TextField
              label="هدف درآمد ماهانه (دلار)"
              optional
              inputMode="numeric"
              value={v.incomeGoalUsd}
              onChange={set('incomeGoalUsd')}
              error={errors.incomeGoalUsd}
            />
          </div>
          <SelectField
            label="تجربه‌ی قبلی"
            optional
            value={v.priorExperience}
            onChange={set('priorExperience')}
            error={errors.priorExperience}
          >
            <option value="">—</option>
            {OPTIONS.priorExperience.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <TextareaField
            label="الان بزرگ‌ترین مانعت چیست؟"
            optional
            value={v.selfReportedBlocker}
            onChange={set('selfReportedBlocker')}
            error={errors.selfReportedBlocker}
            className="min-h-[76px]"
            maxLength={1000}
          />
          <DialogActions>
            <Button onClick={() => setOpen(false)}>انصراف</Button>
            <Button type="submit" variant="primary" loading={saving}>
              ذخیره
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
