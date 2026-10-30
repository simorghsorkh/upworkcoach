'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { ImageUploadField, useImageUploads } from '@/components/files/image-uploads';
import { HTTPS_MESSAGE, isHttpsUrl } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { CannedResponseDTO } from '@/modules/catalog/contracts';
import type { QuestionStatus } from '@/modules/questions/contracts';

/** "Short answer / explanation / for your situation" (user-flows §8). */
export const STAFF_REPLY_TEMPLATE = 'جواب کوتاه: \n\nتوضیح: \n\nبرای موقعیت تو: ';

/**
 * Reply box under a question thread. Staff: optional answer template and "Insert canned reply"
 * (canned responses, e.g. the red lines; its id goes with the message), then "Close question".
 * Student: a follow-up (re-opens a closed thread) and "Thanks, solved".
 */
export function ReplyForm({
  threadId,
  mode,
  status,
  canned = [],
}: {
  threadId: string;
  mode: 'staff' | 'student';
  status: QuestionStatus;
  canned?: CannedResponseDTO[];
}) {
  const router = useRouter();
  const toast = useToast();
  const uploads = useImageUploads();
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [cannedId, setCannedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ body?: string; links?: string; form?: string }>({});
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const closed = status === 'closed';
  const staff = mode === 'staff';

  if (staff && closed) {
    return (
      <Alert tone="neutral" title="این سؤال بسته است.">
        اگر هنرجو پیام تازه‌ای بفرستد، دوباره باز می‌شود و در صف می‌آید.
      </Alert>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const next: typeof errors = {};
    if (!body.trim()) next.body = staff ? 'متن پاسخ را بنویس.' : 'متن پیامت را بنویس.';
    if (link.trim() && !isHttpsUrl(link)) next.links = HTTPS_MESSAGE;
    if (uploads.busy) next.form = 'صبر کن آپلود تصویرها تمام شود.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSending(true);
    const sent = body;
    const res = await apiPost(`/api/v1/questions/${threadId}/messages`, {
      body: body.trim(),
      ...(link.trim() ? { links: [{ url: link.trim() }] } : {}),
      ...(uploads.ids.length ? { attachmentIds: uploads.ids } : {}),
      ...(staff && cannedId ? { cannedResponseId: cannedId } : {}),
    });
    setSending(false);
    if (res.ok) {
      setBody((b) => (b === sent ? '' : b));
      setLink('');
      setCannedId(null);
      uploads.clear();
      toast.show({ message: staff ? 'پاسخ ثبت شد.' : 'پیامت فرستاده شد.' });
      router.refresh();
      return;
    }
    if (res.error.status === 409) {
      setErrors({ form: 'این سؤال همین الان بسته شد. صفحه را تازه کن.' });
      return;
    }
    setErrors({
      body: res.error.fields.body,
      links: res.error.fields.links ?? res.error.fields['links.0.url'],
      form: res.error.fields.body || res.error.fields.links ? undefined : res.error.message,
    });
  }

  async function close() {
    if (closing) return;
    setClosing(true);
    const res = await apiPost(`/api/v1/questions/${threadId}/close`);
    setClosing(false);
    if (res.ok) {
      toast.show({ message: staff ? 'سؤال بسته شد.' : 'خوشحالیم که حل شد.' });
      router.refresh();
      return;
    }
    setErrors({ form: res.error.message });
  }

  const insertCanned = (id: string) => {
    const c = canned.find((x) => x.id === id);
    if (!c) return;
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n${c.body}` : c.body));
    setCannedId(c.id);
  };

  return (
    <form noValidate onSubmit={onSubmit} aria-label={staff ? 'پاسخ به سؤال' : 'پیام تازه'}>
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      {staff ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setBody((b) => (b.trim() ? b : STAFF_REPLY_TEMPLATE))}
          >
            <Icon name="list" size={16} />
            قالب پاسخ
          </Button>
          {canned.length ? (
            <span className="relative inline-flex">
              <label htmlFor={`canned-${threadId}`} className="sr-only">
                درج پاسخ آماده
              </label>
              <select
                id={`canned-${threadId}`}
                value=""
                onChange={(e) => insertCanned(e.target.value)}
                className="min-h-9 cursor-pointer appearance-none rounded-btn-sm border border-line-2 bg-surface ps-3 pe-9 text-sm font-semibold text-fg hover:border-line-strong focus:border-focus focus:shadow-ring focus:outline-none md:min-h-8"
              >
                <option value="">درج پاسخ آماده…</option>
                {canned.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.category === 'red_line' ? `خط قرمز: ${c.title}` : c.title}
                  </option>
                ))}
              </select>
              <Icon
                name="chev-down"
                size={16}
                className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-3"
              />
            </span>
          ) : null}
          {cannedId ? (
            <span className="text-xs text-fg-3">پاسخ آماده درج شد؛ می‌توانی ویرایشش کنی.</span>
          ) : null}
        </div>
      ) : null}
      <TextareaField
        label={staff ? 'پاسخ' : closed ? 'پیام تازه (سؤال دوباره باز می‌شود)' : 'پیام تکمیلی'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={errors.body}
        className="min-h-32"
        placeholder={staff ? 'کوتاه و روشن؛ اگر لازم است یک قدم بعدی مشخص بگو.' : undefined}
      />
      <TextField
        label="لینک"
        optional
        dir="ltr"
        inputMode="url"
        placeholder="https://"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        error={errors.links}
      />
      {staff ? null : <ImageUploadField label="تصویر (اختیاری)" state={uploads} />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!closed ? (
          <Button
            variant="ghost"
            loading={closing}
            onClick={() => void close()}
            className="me-auto max-md:order-last max-md:w-full"
          >
            <Icon name="check-circle" size={16} />
            {staff ? 'بستن سؤال' : 'ممنون، حل شد'}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" loading={sending} className="max-md:flex-1">
          <Icon name="chat" size={16} />
          {staff ? 'ثبت پاسخ' : 'فرستادن'}
        </Button>
      </div>
    </form>
  );
}
