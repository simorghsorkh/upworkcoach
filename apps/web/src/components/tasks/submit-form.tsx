'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { apiPost, apiUpload } from '@/components/api/client';
import { faNumber } from '@/components/format/fa';
import { CheckboxField, HTTPS_MESSAGE, isHttpsUrl } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import type { SubmissionType } from '@/modules/catalog/contracts';
import type { AttachmentUploadedDTO } from '@/modules/files/contracts';
import type { StudentSubmissionDTO, SubmissionCreatedDTO } from '@/modules/tasks/contracts';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 10;

type Upload = {
  key: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  preview: string | null;
  id?: string;
  error?: string;
};

type Draft = {
  bodyText: string;
  link: string;
  platformId: string;
  jobPostText: string;
  proposalText: string;
  profileText: string;
};

const FIELDS = [
  'bodyText',
  'links',
  'attachmentIds',
  'platformId',
  'jobPostText',
  'proposalText',
  'profileText',
  'form',
] as const;
type Field = (typeof FIELDS)[number];

const draftKey = (taskId: string) => `uc:submit-draft:${taskId}`;

function uploadError(status: number, message: string): string {
  if (status === 413) return 'حجم تصویر بیش از ۵ مگابایت است.';
  if (status === 415) return 'فقط تصویر JPG، PNG یا WebP.';
  if (status === 429) return 'تعداد آپلودهایت زیاد بود؛ کمی بعد دوباره امتحان کن.';
  return message;
}

/**
 * S3 «تحویل نسخه‌ی N» (mockups/student-task.html #submit). Fields follow the submission type:
 * text, links (https only), images up to 5 MB, and for «پروپوزال برای بررسی» separate
 * platform, job post and proposal boxes in English (LTR) with the anonymous-use consent OFF by
 * default (D6). A new version starts from the previous one; the text stays on this device until
 * it is sent. Images go to `POST /attachments` first, then the submission links them.
 */
export function SubmitForm({
  taskId,
  type,
  nextVersion,
  previous,
  platforms,
  mentorName,
}: {
  taskId: string;
  type: SubmissionType;
  nextVersion: number;
  /** Latest version, to start the next one from (changes requested). */
  previous: StudentSubmissionDTO | null;
  platforms: Array<{ id: string; name: string }>;
  mentorName: string | null;
}) {
  const router = useRouter();
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const initial: Draft = {
    bodyText: previous?.bodyText ?? '',
    link: previous?.links[0]?.url ?? '',
    platformId: previous?.platform?.id ?? platforms.find((p) => /upwork/i.test(p.name))?.id ?? '',
    jobPostText: previous?.jobPostText ?? '',
    proposalText: previous?.proposalText ?? '',
    profileText: previous?.profileText ?? '',
  };
  const [v, setV] = useState<Draft>(initial);
  const [consent, setConsent] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const loaded = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per task
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey(taskId));
      if (raw) setV({ ...initial, ...(JSON.parse(raw) as Partial<Draft>) });
    } catch {
      // ignore
    }
    loaded.current = true;
  }, [taskId]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(draftKey(taskId), JSON.stringify(v));
    } catch {
      // ignore
    }
  }, [v, taskId]);

  const set =
    (key: keyof Draft) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setV((d) => ({ ...d, [key]: e.target.value }));

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = [...list].slice(0, MAX_IMAGES - uploads.length);
    for (const f of files) {
      const key = `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`;
      if (!IMAGE_TYPES.includes(f.type)) {
        setUploads((u) => [
          ...u,
          {
            key,
            name: f.name,
            status: 'error',
            preview: null,
            error: 'فقط تصویر JPG، PNG یا WebP.',
          },
        ]);
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setUploads((u) => [
          ...u,
          {
            key,
            name: f.name,
            status: 'error',
            preview: null,
            error: 'حجم تصویر بیش از ۵ مگابایت است.',
          },
        ]);
        continue;
      }
      const preview = URL.createObjectURL(f);
      setUploads((u) => [...u, { key, name: f.name, status: 'uploading', preview }]);
      const form = new FormData();
      form.append('file', f);
      const res = await apiUpload<AttachmentUploadedDTO>('/api/v1/attachments', form);
      setUploads((u) =>
        u.map((x) =>
          x.key === key
            ? res.ok
              ? { ...x, status: 'done', id: res.data.id }
              : { ...x, status: 'error', error: uploadError(res.error.status, res.error.message) }
            : x,
        ),
      );
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  function removeUpload(key: string) {
    setUploads((u) => {
      const x = u.find((y) => y.key === key);
      if (x?.preview) URL.revokeObjectURL(x.preview);
      return u.filter((y) => y.key !== key);
    });
  }

  function validate(): Partial<Record<Field, string>> {
    const e: Partial<Record<Field, string>> = {};
    const images = uploads.filter((u) => u.status === 'done').length;
    if (v.link.trim() && !isHttpsUrl(v.link)) e.links = HTTPS_MESSAGE;
    switch (type) {
      case 'text':
        if (!v.bodyText.trim()) e.bodyText = 'متن تحویل را بنویس.';
        break;
      case 'link':
        if (!v.link.trim()) e.links = 'دست‌کم یک لینک بگذار.';
        break;
      case 'file':
        if (!images) e.attachmentIds = 'دست‌کم یک تصویر پیوست کن.';
        break;
      case 'proposal_review':
        if (!v.platformId) e.platformId = 'پلتفرم را انتخاب کن.';
        if (!v.jobPostText.trim()) e.jobPostText = 'متن آگهی را وارد کن.';
        if (!v.proposalText.trim()) e.proposalText = 'متن پروپوزال را وارد کن.';
        break;
      case 'profile_review':
        if (!v.profileText.trim()) e.profileText = 'متن کامل ویترین را وارد کن.';
        break;
      case 'checkbox':
        break;
    }
    if (uploads.some((u) => u.status === 'uploading'))
      e.attachmentIds = 'صبر کن تا آپلود تصویرها تمام شود.';
    return e;
  }

  async function onSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (submitting) return;
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const body: Record<string, unknown> = {};
    if (type !== 'checkbox') {
      if (v.bodyText.trim()) body.bodyText = v.bodyText.trim();
      if (v.link.trim()) body.links = [{ url: v.link.trim() }];
      const ids = uploads.filter((u) => u.status === 'done' && u.id).map((u) => u.id);
      if (ids.length) body.attachmentIds = ids;
    }
    if (type === 'proposal_review') {
      body.platformId = v.platformId;
      body.jobPostText = v.jobPostText.trim();
      body.proposalText = v.proposalText.trim();
      body.aiUseConsent = consent;
    }
    if (type === 'profile_review') body.profileText = v.profileText.trim();
    const res = await apiPost<SubmissionCreatedDTO>(`/api/v1/tasks/${taskId}/submissions`, body);
    setSubmitting(false);
    if (res.ok) {
      try {
        window.localStorage.removeItem(draftKey(taskId));
      } catch {
        // ignore
      }
      setDone(true);
      router.refresh();
      return;
    }
    const f = res.error.fields;
    const next: Partial<Record<Field, string>> = {};
    for (const k of FIELDS) if (f[k]) next[k] = f[k];
    const linkError = Object.entries(f).find(([k]) => k.startsWith('links'))?.[1];
    if (linkError) next.links = linkError;
    if (!Object.keys(next).length) {
      next.form =
        res.error.status === 0
          ? 'ارسال نشد؛ اتصال را بررسی کن و دوباره بزن. متنت روی همین دستگاه مانده است.'
          : res.error.message;
    }
    setErrors(next);
  }

  if (done) {
    return (
      <Alert tone="ok" role="status" title="تحویل شد.">
        {type === 'checkbox'
          ? ' این کار انجام‌شده ثبت شد.'
          : ` ${mentorName ?? 'مشاورت'} معمولاً تا ۴۸ ساعت نگاه می‌کند؛ وقتی بازخورد آمد، روی «کارها» نشان می‌بینی.`}
      </Alert>
    );
  }

  if (type === 'checkbox') {
    return (
      <form noValidate onSubmit={onSubmit} aria-label="انجام این کار">
        {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
        <p className="mb-3 text-sm text-fg-2">وقتی انجامش دادی، بزن؛ همین کافی است.</p>
        <Button type="submit" variant="primary" loading={submitting}>
          <Icon name="check" size={16} />
          انجام دادم
        </Button>
      </form>
    );
  }

  const ltr = 'font-sans [unicode-bidi:isolate]';

  return (
    <form id="submit" noValidate onSubmit={onSubmit} aria-labelledby="h-s" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="h-s" className="flex items-center gap-2 text-h2">
          <Icon name="upload" className="text-fg-3" />
          {`تحویل نسخه‌ی ${faNumber(nextVersion)}`}
        </h2>
        {previous ? (
          <span className="text-xs text-fg-3">{`پیش‌نویس با نسخه‌ی ${faNumber(previous.version)} پر شده است`}</span>
        ) : null}
      </div>
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}

      {type === 'proposal_review' ? (
        <>
          <SelectField
            label="پلتفرم"
            value={v.platformId}
            onChange={set('platformId')}
            error={errors.platformId}
          >
            <option value="">انتخاب کن…</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <TextareaField
            label={
              <>
                متن آگهی <span className="font-normal text-fg-3">(انگلیسی)</span>
              </>
            }
            dir="ltr"
            lang="en"
            value={v.jobPostText}
            onChange={set('jobPostText')}
            error={errors.jobPostText}
            className={ltr}
            hint={
              <>
                <Icon name="info" size={16} className="mt-0.5 flex-none" />
                کپی از صفحه‌ی آگهی. نام شرکت یا اطلاعات تماس کارفرما را پاک کن.
              </>
            }
          />
          <TextareaField
            label={
              <>
                متن پروپوزال <span className="font-normal text-fg-3">(انگلیسی)</span>
              </>
            }
            dir="ltr"
            lang="en"
            value={v.proposalText}
            onChange={set('proposalText')}
            error={errors.proposalText}
            className={cn(ltr, 'min-h-[180px]')}
          />
        </>
      ) : null}

      {type === 'profile_review' ? (
        <TextareaField
          label={
            <>
              متن کامل ویترین{' '}
              <span className="font-normal text-fg-3">(انگلیسی: تیتر، Overview، مهارت‌ها)</span>
            </>
          }
          dir="ltr"
          lang="en"
          value={v.profileText}
          onChange={set('profileText')}
          error={errors.profileText}
          className={cn(ltr, 'min-h-[200px]')}
        />
      ) : null}

      {type === 'text' || type === 'link' || type === 'file' || type === 'profile_review' ? (
        <TextareaField
          label={type === 'text' ? 'متن تحویل' : 'توضیح'}
          optional={type !== 'text'}
          value={v.bodyText}
          onChange={set('bodyText')}
          error={errors.bodyText}
        />
      ) : null}

      <TextField
        label="لینک"
        optional={type !== 'link'}
        dir="ltr"
        inputMode="url"
        placeholder="https://"
        value={v.link}
        onChange={set('link')}
        error={errors.links}
      />

      <div className="mb-5">
        <label htmlFor={fileId} className="mb-1.5 block text-ui font-semibold">
          تصویر{type === 'file' ? '' : <span className="font-normal text-fg-3"> (اختیاری)</span>}
        </label>
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => void addFiles(e.target.files)}
          aria-describedby={`${fileId}-hint`}
          className="block w-full cursor-pointer rounded-sm border border-line-strong bg-surface text-ui file:me-3 file:cursor-pointer file:border-0 file:border-e file:border-line file:bg-surface-2 file:px-3 file:py-2.5 file:font-semibold"
        />
        <p id={`${fileId}-hint`} className="mt-1.5 flex items-start gap-1.5 text-sm text-fg-3">
          <Icon name="eye" size={16} className="mt-0.5 flex-none" />
          JPG، PNG یا WebP تا ۵ مگابایت. پیش از آپلود، نام و عکس کارفرما را بپوشان.
        </p>
        {errors.attachmentIds ? (
          <p
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-h-red-fg"
          >
            <Icon name="alert" size={16} />
            {errors.attachmentIds}
          </p>
        ) : null}
        {uploads.length ? (
          <ul aria-label="تصویرهای پیوست" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {uploads.map((u) => (
              <li
                key={u.key}
                className="relative overflow-hidden rounded-sm border border-line bg-bg"
              >
                {u.preview ? (
                  // biome-ignore lint/performance/noImgElement: local object-URL preview
                  <img src={u.preview} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <span className="grid aspect-[4/3] place-items-center text-fg-3">
                    <Icon name="file" size={24} />
                  </span>
                )}
                <span className="flex items-center gap-1 px-2 py-1 text-xs">
                  <span dir="auto" className="min-w-0 flex-1 truncate">
                    {u.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUpload(u.key)}
                    className="inline-grid size-7 cursor-pointer place-items-center rounded-xs text-fg-2 hover:bg-surface-2"
                    aria-label={`برداشتن ${u.name}`}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </span>
                <span role="status" className="block px-2 pb-1.5 text-xs">
                  {u.status === 'uploading' ? (
                    <span className="text-fg-3">در حال آپلود…</span>
                  ) : u.status === 'error' ? (
                    <span className="font-semibold text-h-red-fg">{u.error}</span>
                  ) : (
                    <span className="text-h-green-fg">آپلود شد</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {type === 'proposal_review' ? (
        <div className="mb-5 rounded-md border border-line bg-bg px-4 pt-3">
          <CheckboxField
            className="mb-3"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            label={
              <>
                اجازه می‌دهم این آگهی و پروپوزال <strong>بدون نام من</strong> برای بهتر کردن آموزش و
                ابزارهای UpworkCoach استفاده شود.
              </>
            }
            hint="اختیاری است و بدون آن هم بازخورد می‌گیری."
          />
        </div>
      ) : null}

      <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3 md:static md:mx-0 md:border-0 md:px-0 md:pb-0">
        <span className="me-auto inline-flex items-center gap-1 text-xs text-fg-3 max-md:hidden">
          <Icon name="lock" size={14} />
          متنت تا ارسال روی همین دستگاه نگه داشته می‌شود
        </span>
        <Button type="submit" variant="primary" loading={submitting} className="max-md:flex-1">
          <Icon name="upload" size={16} />
          {`تحویل نسخه‌ی ${faNumber(nextVersion)}`}
        </Button>
      </div>
    </form>
  );
}

/** «شروع کردم» (optional, open → in progress). */
export function StartTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await apiPost(`/api/v1/tasks/${taskId}/start`);
          setBusy(false);
          if (res.ok) router.refresh();
          else setError(res.error.message);
        }}
      >
        <Icon name="st-progress" size={14} />
        شروع کردم
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-h-red-fg">
          {error}
        </span>
      ) : null}
    </span>
  );
}
