'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPatch } from '@/components/api/client';
import { toLatinDigits } from '@/components/format/fa';
import { splitApiError, splitTags } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { PlatformDTO, TrackDTO } from '@/modules/catalog/contracts';
import type { StaffStudentDTO } from '@/modules/students/contracts';
import { OPTIONS } from './labels';

type Values = {
  level: string;
  nicheStatement: string;
  tags: string;
  cohort: string;
  trackId: string;
  primaryPlatformId: string;
  messengerHandle: string;
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
  'level',
  'nicheStatement',
  'tags',
  'cohort',
  'trackId',
  'primaryPlatformId',
  'messengerHandle',
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

const str = (v: string | number | null) => (v === null ? '' : String(v));

function fromStudent(s: StaffStudentDTO): Values {
  return {
    level: s.level ?? '',
    nicheStatement: s.nicheStatement ?? '',
    tags: s.tags.join('، '),
    cohort: s.cohort ?? '',
    trackId: s.track?.id ?? '',
    primaryPlatformId: s.primaryPlatform?.id ?? '',
    messengerHandle: s.messengerHandle ?? '',
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

function toApi(key: Field, value: string): unknown {
  if (key === 'tags') return splitTags(value);
  const v = value.trim();
  if (v === '') return null;
  if (NUMERIC.has(key)) return toLatinDigits(v);
  return v;
}

const SCALE = ['1', '2', '3', '4', '5'];

/** M3f — edit the record (`PATCH /api/v1/students/:id` with only the changed fields). */
export function EditInfoDialog({
  student,
  tracks,
  platforms,
}: {
  student: StaffStudentDTO;
  tracks: TrackDTO[];
  platforms: PlatformDTO[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(() => fromStudent(student));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openDialog() {
    setValues(fromStudent(student));
    setErrors({});
    setFormError(null);
    setOpen(true);
  }

  const bind = (key: Field) => ({
    name: key,
    value: values[key],
    error: errors[key],
    onChange: (e: { target: { value: string } }) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const start = fromStudent(student);
    const body: Record<string, unknown> = {};
    for (const key of FIELDS) {
      const now = toApi(key, values[key]);
      if (JSON.stringify(now) !== JSON.stringify(toApi(key, start[key]))) body[key] = now;
    }
    if (Object.keys(body).length === 0) {
      setOpen(false);
      return;
    }
    body.ifUpdatedAt = student.updatedAt;
    setSubmitting(true);
    setFormError(null);
    const result = await apiPatch<StaffStudentDTO>(`/api/v1/students/${student.id}`, body);
    setSubmitting(false);
    if (result.ok) {
      setOpen(false);
      toast.show({ message: 'اطلاعات پرونده ذخیره شد.' });
      router.refresh();
      return;
    }
    const { error } = result;
    if (error.status === 409) {
      setFormError(
        'کس دیگری زودتر این پرونده را تغییر داد. پنجره را ببند، صفحه را تازه کن و دوباره بزن.',
      );
      return;
    }
    if (error.status === 404) {
      setFormError('این پرونده دیگر در دسترس تو نیست.');
      return;
    }
    const split = splitApiError(error, FIELDS);
    setErrors(split.fields);
    setFormError(split.form);
  }

  const scaleSelect = (key: Field, label: string) => (
    <SelectField label={label} optional {...bind(key)}>
      <option value="">—</option>
      {SCALE.map((n) => (
        <option key={n} value={n}>
          {`${Number(n).toLocaleString('fa-IR')} از ۵`}
        </option>
      ))}
    </SelectField>
  );

  return (
    <>
      <Button size="sm" variant="ghost" aria-haspopup="dialog" onClick={openDialog}>
        <Icon name="pen" size={16} />
        ویرایش
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`ویرایش اطلاعات ${student.displayName}`}
      >
        <form noValidate onSubmit={onSubmit} aria-label="ویرایش اطلاعات پرونده">
          {formError ? <Alert tone="error" role="alert" title={formError} /> : null}
          <div className="grid gap-x-4 md:grid-cols-2">
            <SelectField label="سطح" optional {...bind('level')}>
              <option value="">—</option>
              {OPTIONS.level.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectField>
            <SelectField label="شاخه" optional {...bind('trackId')}>
              <option value="">—</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {`${t.code} ${t.name}`}
                </option>
              ))}
            </SelectField>
            <SelectField label="پلتفرم اصلی" optional {...bind('primaryPlatformId')}>
              <option value="">—</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
            <TextField
              label="آیدی پیام‌رسان"
              optional
              dir="ltr"
              placeholder="@username"
              {...bind('messengerHandle')}
            />
          </div>
          <TextareaField
            label="نیچ"
            optional
            className="min-h-[76px]"
            placeholder="Shopify speed optimization for DTC stores"
            {...bind('nicheStatement')}
          />
          <div className="grid gap-x-4 md:grid-cols-2">
            <TextField label="برچسب‌ها" optional hint="با ویرگول جدا کن." {...bind('tags')} />
            <TextField label="کوهورت" optional {...bind('cohort')} />
            <TextField label="مهارت اصلی" optional {...bind('primarySkill')} />
            {scaleSelect('skillLevel', 'سطح مهارت')}
            {scaleSelect('englishWriting', 'انگلیسی نوشتاری')}
            {scaleSelect('englishSpeaking', 'انگلیسی گفتاری')}
            <TextField
              label="وقت در هفته (ساعت)"
              optional
              inputMode="numeric"
              dir="ltr"
              {...bind('hoursPerWeek')}
            />
            <TextField
              label="هدف درآمد ماهانه (دلار)"
              optional
              inputMode="numeric"
              dir="ltr"
              {...bind('incomeGoalUsd')}
            />
          </div>
          <SelectField label="تجربه‌ی قبلی" optional {...bind('priorExperience')}>
            <option value="">—</option>
            {OPTIONS.priorExperience.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <TextareaField
            label="هدف ۹۰ روزه"
            optional
            className="min-h-[76px]"
            {...bind('goal90d')}
          />
          <TextareaField
            label="مانع اصلی (از زبان هنرجو)"
            optional
            className="min-h-[76px]"
            {...bind('selfReportedBlocker')}
          />
          <DialogActions>
            <Button onClick={() => setOpen(false)}>انصراف</Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {submitting ? 'در حال ذخیره…' : 'ذخیره'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
