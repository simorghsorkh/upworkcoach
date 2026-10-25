'use client';

import { type FormEvent, useRef, useState } from 'react';
import { apiPatch, apiPost } from '@/components/api/client';
import {
  CheckboxField,
  cleanDecimal,
  HTTPS_MESSAGE,
  isHttpsUrl,
  splitApiError,
} from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { OPTIONS } from '@/components/students/labels';
import { Button } from '@/components/ui/button';
import { DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import type { PlatformDTO } from '@/modules/catalog/contracts';
import type {
  ProfileDTO,
  ProfileKind,
  ProfileStatus,
  RateUnit,
} from '@/modules/students/contracts';

type Field =
  | 'platformId'
  | 'kind'
  | 'publicUrl'
  | 'headline'
  | 'status'
  | 'rateAmount'
  | 'rateCurrency'
  | 'rateUnit'
  | 'niche'
  | 'notes'
  | 'isPrimary';
const FIELDS: readonly Field[] = [
  'platformId',
  'kind',
  'publicUrl',
  'headline',
  'status',
  'rateAmount',
  'rateCurrency',
  'rateUnit',
  'niche',
  'notes',
  'isPrimary',
];

type Values = {
  platformId: string;
  kind: ProfileKind;
  publicUrl: string;
  headline: string;
  status: ProfileStatus;
  rateAmount: string;
  rateCurrency: string;
  rateUnit: RateUnit | '';
  niche: string;
  notes: string;
  isPrimary: boolean;
};

function initialValues(profile: ProfileDTO | undefined, platforms: PlatformDTO[]): Values {
  return {
    platformId: profile?.platform.id ?? platforms[0]?.id ?? '',
    kind: profile?.kind ?? 'profile',
    publicUrl: profile?.publicUrl ?? '',
    headline: profile?.headline ?? '',
    status: profile?.status ?? 'building',
    rateAmount: profile?.rateAmount ? String(Number(profile.rateAmount)) : '',
    rateCurrency: profile?.rateCurrency ?? 'USD',
    rateUnit: profile?.rateUnit ?? '',
    niche: profile?.niche ?? '',
    notes: profile?.notes ?? '',
    isPrimary: profile?.isPrimary ?? false,
  };
}

/** Value sent to the API: '' clears a nullable field (null), text is trimmed. */
function apiValue(key: Field, values: Values): unknown {
  switch (key) {
    case 'isPrimary':
      return values.isPrimary;
    case 'kind':
    case 'status':
    case 'platformId':
      return values[key];
    case 'rateAmount':
      return values.rateAmount.trim() ? cleanDecimal(values.rateAmount) : null;
    case 'rateCurrency':
      return values.rateAmount.trim() ? values.rateCurrency.trim().toUpperCase() || 'USD' : null;
    case 'rateUnit':
      return values.rateAmount.trim() ? values.rateUnit || null : null;
    default: {
      const v = (values[key] as string).trim();
      return v === '' ? null : v;
    }
  }
}

/**
 * Platform showcase form (F2, user-flows §2) for staff (`/students/:id/profiles`) and the
 * student (`/me/profiles`). Security rule 8 / PRD §6: there is NO password field and a fixed
 * warning says so; only a public https link is stored and the system never opens it.
 */
export function ProfileForm({
  mode,
  createUrl,
  platforms,
  profile,
  onSaved,
  onCancel,
}: {
  /** `staff`: the notes field says the student sees it (SEC-F6). */
  mode: 'staff' | 'student';
  /** POST target for a new showcase. */
  createUrl: string;
  platforms: PlatformDTO[];
  /** Present when editing (PATCH /profiles/:id with ifUpdatedAt). */
  profile?: ProfileDTO;
  onSaved: (profile: ProfileDTO) => void;
  onCancel: () => void;
}) {
  const start = initialValues(profile, platforms);
  const [values, setValues] = useState<Values>(start);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    if (!values.platformId) found.platformId = 'پلتفرم را انتخاب کن.';
    if (values.publicUrl.trim() && !isHttpsUrl(values.publicUrl)) found.publicUrl = HTTPS_MESSAGE;
    if (values.rateAmount.trim()) {
      if (cleanDecimal(values.rateAmount) === null)
        found.rateAmount = 'نرخ را با عدد بنویس؛ مثلاً ۲۵ یا ۲۵٫۵.';
      if (values.rateCurrency.trim() && !/^[A-Za-z]{3}$/.test(values.rateCurrency.trim()))
        found.rateCurrency = 'کد ارز سه‌حرفی است (مثلاً USD).';
    }
    return found;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) {
      if (found.publicUrl) urlRef.current?.focus();
      return;
    }

    const body: Record<string, unknown> = {};
    if (profile) {
      for (const key of FIELDS) {
        const now = apiValue(key, values);
        if (JSON.stringify(now) !== JSON.stringify(apiValue(key, start))) body[key] = now;
      }
      if (Object.keys(body).length === 0) {
        onCancel();
        return;
      }
      body.ifUpdatedAt = profile.updatedAt;
    } else {
      for (const key of FIELDS) {
        const v = apiValue(key, values);
        if (v !== null && v !== '' && !(key === 'isPrimary' && v === false)) body[key] = v;
      }
    }

    setSubmitting(true);
    const result = profile
      ? await apiPatch<ProfileDTO>(`/api/v1/profiles/${profile.id}`, body)
      : await apiPost<ProfileDTO>(createUrl, body);
    setSubmitting(false);
    if (result.ok) {
      onSaved(result.data);
      return;
    }
    const { error } = result;
    if (error.status === 404) {
      setFormError('این ویترین دیگر وجود ندارد (شاید حذف شده). صفحه را تازه کن.');
      return;
    }
    if (error.status === 409) {
      setFormError('کس دیگری همین حالا این ویترین را تغییر داد. صفحه را تازه کن و دوباره بزن.');
      return;
    }
    const split = splitApiError(error, FIELDS);
    setErrors(split.fields);
    setFormError(split.form);
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label={profile ? 'ویرایش ویترین' : 'ویترین تازه'}>
      {formError ? <Alert tone="error" role="alert" title={formError} /> : null}
      <div className="grid gap-x-4 md:grid-cols-2">
        <SelectField
          label="پلتفرم"
          name="platformId"
          value={values.platformId}
          onChange={(e) => set('platformId', e.target.value)}
          error={errors.platformId}
        >
          {platforms.length === 0 ? <option value="">پلتفرمی تعریف نشده</option> : null}
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="نوع"
          name="kind"
          value={values.kind}
          onChange={(e) => set('kind', e.target.value as ProfileKind)}
          error={errors.kind}
        >
          {OPTIONS.profileKind.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>

      <TextField
        ref={urlRef}
        label="لینک عمومی"
        optional
        name="publicUrl"
        type="url"
        inputMode="url"
        dir="ltr"
        autoComplete="off"
        placeholder="https://www.upwork.com/freelancers/~…"
        value={values.publicUrl}
        onChange={(e) => set('publicUrl', e.target.value)}
        error={errors.publicUrl}
        fieldClassName="mb-2"
      />
      <Alert tone="warn" icon="lock" title="توجه:" className="mb-5">
        رمز یا کد ورود هیچ حسابی را این‌جا ننویس. فقط لینک عمومی پروفایل لازم است.
      </Alert>

      <TextField
        label="تیتر"
        optional
        name="headline"
        dir="auto"
        placeholder="Shopify Speed Expert | Core Web Vitals"
        value={values.headline}
        onChange={(e) => set('headline', e.target.value)}
        error={errors.headline}
      />

      <div className="grid gap-x-4 md:grid-cols-2">
        <SelectField
          label="وضعیت"
          name="status"
          value={values.status}
          onChange={(e) => set('status', e.target.value as ProfileStatus)}
          error={errors.status}
        >
          {OPTIONS.profileStatus.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="نیچ این ویترین"
          optional
          name="niche"
          dir="auto"
          value={values.niche}
          onChange={(e) => set('niche', e.target.value)}
          error={errors.niche}
        />
      </div>

      <fieldset className="mb-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 md:grid-cols-3">
        <legend className="mb-1.5 text-ui font-semibold">
          نرخ <span className="font-normal text-fg-3">(اختیاری)</span>
        </legend>
        <TextField
          label="مبلغ"
          name="rateAmount"
          inputMode="decimal"
          dir="ltr"
          placeholder="25"
          value={values.rateAmount}
          onChange={(e) => set('rateAmount', e.target.value)}
          error={errors.rateAmount}
          fieldClassName="max-md:col-span-2"
        />
        <TextField
          label="ارز"
          name="rateCurrency"
          dir="ltr"
          maxLength={3}
          autoCapitalize="characters"
          value={values.rateCurrency}
          onChange={(e) => set('rateCurrency', e.target.value)}
          error={errors.rateCurrency}
        />
        <SelectField
          label="واحد"
          name="rateUnit"
          value={values.rateUnit}
          onChange={(e) => set('rateUnit', e.target.value as RateUnit | '')}
          error={errors.rateUnit}
        >
          <option value="">—</option>
          {OPTIONS.rateUnit.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </fieldset>

      <TextareaField
        label="یادداشت"
        optional
        name="notes"
        value={values.notes}
        onChange={(e) => set('notes', e.target.value)}
        error={errors.notes}
        className="min-h-20"
        hint={
          mode === 'staff' ? (
            <>
              <Icon name="eye" size={16} className="mt-0.5 flex-none" />
              هنرجو این را می‌بیند. یادداشت داخلی جای دیگری است.
            </>
          ) : (
            'مشاورت هم این را می‌بیند.'
          )
        }
      />

      <CheckboxField
        label="ویترین اصلی"
        hint="در سربرگ پرونده نشان داده می‌شود؛ هر هنرجو یک ویترین اصلی دارد."
        name="isPrimary"
        checked={values.isPrimary}
        onChange={(e) => set('isPrimary', e.target.checked)}
      />
      {errors.isPrimary ? (
        <p role="alert" className="-mt-3 mb-4 text-sm font-semibold text-h-red-fg">
          {errors.isPrimary}
        </p>
      ) : null}

      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {submitting ? 'در حال ثبت…' : profile ? 'ذخیره‌ی تغییرات' : 'افزودن ویترین'}
        </Button>
      </DialogActions>
    </form>
  );
}
