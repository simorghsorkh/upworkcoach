'use client';

import Link from 'next/link';
import { type FormEvent, useRef, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { cleanPhoneInput, looksLikePhone } from '@/components/auth/phone';
import { faDate, faNumber, tehranDaysBetween } from '@/components/format/fa';
import {
  copyText,
  HTTPS_MESSAGE,
  isHttpsUrl,
  splitApiError,
  splitTags,
} from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Button, buttonClass } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import type { PlatformDTO } from '@/modules/catalog/contracts';
import type { MentorOptionDTO } from '@/modules/identity/contracts';
import type { ProfileDTO, StudentCreatedDTO } from '@/modules/students/contracts';

type Field =
  | 'displayName'
  | 'phone'
  | 'mentorId'
  | 'stageId'
  | 'primaryPlatformId'
  | 'link'
  | 'tags'
  | 'initialNote';
const FIELDS: readonly Field[] = [
  'displayName',
  'phone',
  'mentorId',
  'stageId',
  'primaryPlatformId',
  'link',
  'tags',
  'initialNote',
];

export type StageOption = { id: string; name: string; displayCode: string };

export type NewStudentResult = StudentCreatedDTO & {
  /** Set when a showcase link was given but could not be saved (the student exists anyway). */
  profileError: string | null;
};

const NONE = '';
const UNASSIGNED = 'none';

/**
 * M2a — new student (user-flows §1): only name and mobile are required; mentor for admins,
 * then optional stage, primary platform, showcase link and tags. `POST /api/v1/students`,
 * then (only if a link was given) `POST /api/v1/students/:id/profiles`.
 */
export function NewStudentForm({
  viewer,
  mentors,
  stages,
  platforms,
  onCreated,
  onCancel,
}: {
  viewer: { id: string; role: 'admin' | 'mentor' };
  mentors: MentorOptionDTO[];
  stages: StageOption[];
  platforms: PlatformDTO[];
  onCreated: (result: NewStudentResult) => void;
  onCancel: () => void;
}) {
  const isAdmin = viewer.role === 'admin';
  const [values, setValues] = useState({
    displayName: '',
    phone: '',
    mentorId: viewer.id,
    stageId: NONE,
    primaryPlatformId: NONE,
    link: '',
    tags: '',
    initialNote: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const refs = {
    displayName: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
  };

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    if (!values.displayName.trim()) found.displayName = 'نام هنرجو را بنویس.';
    const phone = cleanPhoneInput(values.phone);
    if (!phone) found.phone = 'شماره‌ی موبایل را بنویس.';
    else if (!looksLikePhone(phone))
      found.phone = 'این شماره درست به نظر نمی‌رسد؛ مثل ۰۹۱۲۳۴۵۶۷۸۹ بنویس.';
    if (values.link.trim()) {
      if (!isHttpsUrl(values.link)) found.link = HTTPS_MESSAGE;
      if (!values.primaryPlatformId)
        found.primaryPlatformId = 'برای لینک ویترین، پلتفرمش را انتخاب کن.';
    }
    return found;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      if (found.displayName) refs.displayName.current?.focus();
      else if (found.phone) refs.phone.current?.focus();
      else setDetailsOpen(true);
      return;
    }

    const body: Record<string, unknown> = {
      displayName: values.displayName.trim(),
      phone: cleanPhoneInput(values.phone),
    };
    if (isAdmin) body.mentorId = values.mentorId === UNASSIGNED ? null : values.mentorId;
    if (values.stageId) body.stageId = values.stageId;
    if (values.primaryPlatformId) body.primaryPlatformId = values.primaryPlatformId;
    const tags = splitTags(values.tags);
    if (tags.length) body.tags = tags;
    // The free note becomes the first internal note of the record (sprint 3, `initialNote`).
    if (values.initialNote.trim()) body.initialNote = values.initialNote.trim();

    setSubmitting(true);
    const result = await apiPost<StudentCreatedDTO>('/api/v1/students', body);
    if (!result.ok) {
      setSubmitting(false);
      const { error } = result;
      if (error.status === 403) {
        setFormError('اجازه‌ی ساخت هنرجو را نداری؛ از مدیر بخواه.');
        return;
      }
      const split = splitApiError(error, FIELDS);
      setErrors(split.fields);
      setFormError(split.form);
      if (split.fields.phone) refs.phone.current?.focus();
      else if (split.fields.displayName) refs.displayName.current?.focus();
      else if (
        split.fields.stageId ||
        split.fields.primaryPlatformId ||
        split.fields.tags ||
        split.fields.initialNote
      )
        setDetailsOpen(true);
      return;
    }

    let profileError: string | null = null;
    if (values.link.trim()) {
      const platform = platforms.find((p) => p.id === values.primaryPlatformId);
      const profile = await apiPost<ProfileDTO>(
        `/api/v1/students/${result.data.student.id}/profiles`,
        {
          platformId: values.primaryPlatformId,
          kind: platform && /linkedin/i.test(platform.name) ? 'linkedin' : 'profile',
          publicUrl: values.link.trim(),
          isPrimary: true,
        },
      );
      if (!profile.ok) {
        profileError =
          profile.error.fields.publicUrl ?? profile.error.message ?? 'لینک ویترین ذخیره نشد.';
      }
    }
    setSubmitting(false);
    onCreated({ ...result.data, profileError });
  }

  const otherMentors = mentors.filter((m) => m.id !== viewer.id);

  return (
    <form noValidate onSubmit={onSubmit} aria-label="هنرجوی جدید">
      {formError ? <Alert tone="error" role="alert" title={formError} /> : null}
      <TextField
        ref={refs.displayName}
        label="نام و نام خانوادگی"
        name="displayName"
        autoComplete="off"
        value={values.displayName}
        onChange={(e) => set('displayName')(e.target.value)}
        error={errors.displayName}
      />
      <TextField
        ref={refs.phone}
        label="موبایل"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        dir="ltr"
        placeholder="0912 345 6789"
        value={values.phone}
        onChange={(e) => set('phone')(e.target.value)}
        error={errors.phone}
        hint="رقم فارسی یا انگلیسی فرقی ندارد."
      />
      {isAdmin ? (
        <SelectField
          label="مشاور"
          name="mentorId"
          value={values.mentorId}
          onChange={(e) => set('mentorId')(e.target.value)}
          error={errors.mentorId}
        >
          <option value={viewer.id}>خودم</option>
          {otherMentors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
          <option value={UNASSIGNED}>بدون مشاور (بعداً)</option>
        </SelectField>
      ) : null}

      <details
        className="group mb-4"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
      >
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-ui font-semibold text-fg-2 hover:bg-surface-2 hover:text-fg group-open:mb-3 [&::-webkit-details-marker]:hidden">
          جزئیات بیشتر <span className="font-normal text-fg-3">(اختیاری)</span>
          <Icon
            name="chev-down"
            size={16}
            className="transition-transform duration-150 group-open:rotate-180"
          />
        </summary>
        <SelectField
          label="مرحله‌ی فعلی (تخمین تو)"
          name="stageId"
          value={values.stageId}
          onChange={(e) => set('stageId')(e.target.value)}
          error={errors.stageId}
          hint="اگر خالی بماند، از اولین مرحله شروع می‌کند."
        >
          <option value={NONE}>اولین مرحله</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.displayCode} — ${s.name}`}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="پلتفرم اصلی"
          name="primaryPlatformId"
          value={values.primaryPlatformId}
          onChange={(e) => set('primaryPlatformId')(e.target.value)}
          error={errors.primaryPlatformId}
        >
          <option value={NONE}>هنوز معلوم نیست</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="لینک ویترین (اگر دارد)"
          name="link"
          type="url"
          inputMode="url"
          dir="ltr"
          placeholder="https://"
          value={values.link}
          onChange={(e) => set('link')(e.target.value)}
          error={errors.link}
          hint="فقط لینک عمومی پروفایل؛ رمز یا کد ورود هیچ حسابی را این‌جا ننویس."
        />
        <TextField
          label="برچسب‌ها"
          name="tags"
          value={values.tags}
          onChange={(e) => set('tags')(e.target.value)}
          error={errors.tags}
          hint="با ویرگول جدا کن؛ مثلاً «طراحی UI، کوهورت پاییز»."
        />
        <TextareaField
          label="یادداشت آزاد"
          optional
          name="initialNote"
          value={values.initialNote}
          onChange={(e) => set('initialNote')(e.target.value)}
          error={errors.initialNote}
          placeholder="هر چیزی که الان در ذهنت است…"
          hint="یادداشت داخلی اول پرونده می‌شود؛ هنرجو آن را نمی‌بیند."
          className="min-h-[76px]"
        />
      </details>

      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {submitting ? 'در حال ساخت…' : 'ساخت و گرفتن لینک دعوت'}
        </Button>
      </DialogActions>
    </form>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Ready-made Telegram message (user-flows §1). */
export function inviteMessage(name: string, url: string, days: number): string {
  return `سلام ${firstName(name)}، این لینک ورود تو به دفتر کار ماست. یک رمز بگذار و اولین کارت را ببین: ${url} (تا ${faNumber(days)} روز معتبر)`;
}

/**
 * The one-time invite link (C1: token in the `#` fragment, shown only here, never stored by
 * the UI). Copy the link alone or the whole Telegram message.
 */
export function InviteReady({ result, onDone }: { result: NewStudentResult; onDone: () => void }) {
  const [copied, setCopied] = useState<'link' | 'message' | 'failed' | null>(null);
  const expires = new Date(result.expiresAt);
  const days = Math.max(1, tehranDaysBetween(new Date(), expires));
  const message = inviteMessage(result.student.displayName, result.inviteUrl, days);

  async function copy(kind: 'link' | 'message') {
    const ok = await copyText(kind === 'link' ? result.inviteUrl : message);
    setCopied(ok ? kind : 'failed');
  }

  return (
    <div>
      <p className="mb-3 text-sm text-fg-2">
        {`لینک یک‌بارمصرف · تا ${faDate(expires)} (${faNumber(days)} روز) معتبر. این لینک را خودت برایش بفرست؛ نسخه‌ی 0.1 پیامک ندارد.`}
      </p>
      {result.profileError ? (
        <Alert tone="warn" title="لینک ویترین ذخیره نشد.">
          {`${result.profileError} می‌توانی در پرونده دوباره اضافه‌اش کنی.`}
        </Alert>
      ) : null}
      <div className="flex items-center gap-2 rounded-sm border border-line-2 bg-bg py-1.5 ps-3 pe-1.5">
        <Icon name="link" size={16} className="text-fg-3" />
        <code
          dir="ltr"
          className="min-w-0 flex-1 truncate text-start font-sans text-ui [unicode-bidi:isolate]"
          data-testid="invite-url"
        >
          {result.inviteUrl}
        </code>
        <Button size="sm" onClick={() => void copy('link')}>
          <Icon name="copy" size={16} />
          کپی
        </Button>
      </div>
      <p className="mt-5 mb-1.5 text-xs font-semibold text-fg-3">متن آماده برای تلگرام</p>
      <div className="rounded-[14px] rounded-es-[4px] bg-surface-2 px-4 py-3 text-ui leading-6 [overflow-wrap:anywhere]">
        {message}
      </div>
      <p
        role="status"
        className={cn(
          'mt-2 min-h-5 text-sm font-semibold',
          copied === 'failed' ? 'text-h-red-fg' : 'text-h-green-fg',
        )}
      >
        {copied === 'link'
          ? 'لینک کپی شد.'
          : copied === 'message'
            ? 'متن و لینک کپی شد.'
            : copied === 'failed'
              ? 'کپی نشد؛ لینک را انتخاب کن و دستی کپی کن.'
              : ''}
      </p>
      <DialogActions>
        <Link href={`/students/${result.student.id}`} className={buttonClass()} onClick={onDone}>
          رفتن به پرونده
        </Link>
        <Button variant="primary" onClick={() => void copy('message')}>
          <Icon name="copy" size={16} />
          کپی متن و لینک
        </Button>
      </DialogActions>
    </div>
  );
}
