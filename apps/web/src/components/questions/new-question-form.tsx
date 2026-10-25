'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { ImageUploadField, useImageUploads } from '@/components/files/image-uploads';
import { CheckboxField, HTTPS_MESSAGE, isHttpsUrl } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import type { StudentQuestionDetailDTO } from '@/modules/questions/contracts';
import { EXTENSION_SUBJECT, RED_LINES_HINT } from './labels';

type Field = 'subject' | 'body' | 'links' | 'form';

/**
 * S5 «سؤال جدید» (user-flows §8): subject, text, an optional link and images; when it comes
 * from a task page the task travels with it (`taskId`). `kind="extension"` is «وقت بیشتری
 * لازم دارم»: the same question with a fixed subject (only staff extend deadlines). Under the
 * button: when the answer usually comes and the red lines in one line.
 */
export function NewQuestionForm({
  expectedResponseText,
  task,
  kind = 'question',
}: {
  expectedResponseText: string;
  task?: { id: string; title: string } | null;
  kind?: 'question' | 'extension';
}) {
  const router = useRouter();
  const uploads = useImageUploads();
  const extension = kind === 'extension';
  const [subject, setSubject] = useState(
    extension ? EXTENSION_SUBJECT : task ? `درباره‌ی «${task.title}»` : '',
  );
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const next: Partial<Record<Field, string>> = {};
    if (!subject.trim()) next.subject = 'موضوع سؤال را بنویس.';
    if (!body.trim())
      next.body = extension ? 'بنویس چقدر وقت بیشتر لازم داری و چرا.' : 'سؤالت را کامل‌تر بنویس.';
    if (link.trim() && !isHttpsUrl(link)) next.links = HTTPS_MESSAGE;
    if (uploads.busy) next.form = 'صبر کن آپلود تصویرها تمام شود.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSending(true);
    const res = await apiPost<StudentQuestionDetailDTO>('/api/v1/me/questions', {
      subject: subject.trim(),
      body: body.trim(),
      ...(link.trim() ? { links: [{ url: link.trim() }] } : {}),
      ...(uploads.ids.length ? { attachmentIds: uploads.ids } : {}),
      ...(task ? { taskId: task.id } : {}),
      ...(urgent ? { priority: 'urgent' } : {}),
    });
    if (res.ok) {
      router.push(`/my/questions/${res.data.id}?sent=1`);
      router.refresh();
      return;
    }
    setSending(false);
    const f = res.error.fields;
    const fieldErrors: Partial<Record<Field, string>> = {
      subject: f.subject,
      body: f.body,
      links: f.links ?? f['links.0.url'],
    };
    const hasField = Object.values(fieldErrors).some(Boolean);
    setErrors({ ...fieldErrors, form: hasField ? undefined : res.error.message });
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label={extension ? EXTENSION_SUBJECT : 'سؤال جدید'}>
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      {task ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg-2">
          <Icon name="tasks" size={16} className="text-fg-3" />
          {'درباره‌ی کار: '}
          <bdi className="font-semibold text-fg">{task.title}</bdi>
        </p>
      ) : null}
      <TextField
        label="موضوع"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        error={errors.subject}
        maxLength={200}
        readOnly={extension}
      />
      <TextareaField
        label={extension ? 'چقدر وقت بیشتر لازم داری و چرا؟' : 'سؤالت'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={errors.body}
        className="min-h-36"
        hint={
          extension
            ? 'مثلاً «۳ روز بیشتر؛ این هفته امتحان دارم». تمدید را مشاورت انجام می‌دهد.'
            : 'هر چه دقیق‌تر بنویسی، جواب دقیق‌تری می‌گیری. متن انگلیسی آگهی را هم می‌توانی همین‌جا بگذاری.'
        }
      />
      {extension ? null : (
        <>
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
          <ImageUploadField label="تصویر (اختیاری)" state={uploads} />
          <CheckboxField
            label="فوری است"
            checked={urgent}
            onChange={(e) => setUrgent(e.target.checked)}
            hint="فقط وقتی کارفرما منتظر جواب توست؛ سؤال فوری زودتر جواب می‌گیرد."
          />
        </>
      )}
      <div className="rounded-md border border-line bg-bg px-4 py-3 text-sm text-fg-2">
        <p className="flex items-center gap-1.5 font-semibold text-fg">
          <Icon name="clock" size={16} className="text-fg-3" />
          {`${expectedResponseText} جواب می‌گیری.`}
        </p>
        <p className="mt-1 text-fg-3">{RED_LINES_HINT}</p>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit" variant="primary" loading={sending} className="max-md:w-full">
          <Icon name="chat" size={16} />
          {extension ? 'فرستادن درخواست' : 'فرستادن سؤال'}
        </Button>
      </div>
    </form>
  );
}
