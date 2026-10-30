'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPatch, apiPost, apiPut } from '@/components/api/client';
import { faDays, faNumber, toLatinDigits } from '@/components/format/fa';
import { CheckboxField, HTTPS_MESSAGE, isHttpsUrl } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { TextareaField, TextField } from '@/components/ui/field';
import { Alert, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { StageDTO } from '@/modules/catalog/contracts';

function expected(stage: StageDTO) {
  if (stage.isOpenEnded) return 'پیوسته';
  if (stage.expectedDays === null) return 'متغیر';
  return `تا ${faDays(stage.expectedDays)}`;
}

/**
 * M11 "Path stages" (admin): name, code, usual duration, order, student text and content links;
 * deactivate (409 while active students are in it) and reactivate. No code change needed to
 * adjust the path (tech-stack rule 7: the UI never depends on stage names or ids).
 */
export function StagesSettings({ stages: initial }: { stages: StageDTO[] }) {
  const router = useRouter();
  const toast = useToast();
  const [stages, setStages] = useState(initial);
  const [editing, setEditing] = useState<StageDTO | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (to < 0 || to >= stages.length) return;
    const ids = stages.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    setBusy(moved);
    setError(null);
    const result = await apiPut<StageDTO[]>('/api/v1/stages/order', { stageIds: ids });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setStages(result.data);
    router.refresh();
  }

  async function toggle(stage: StageDTO) {
    setBusy(stage.id);
    setError(null);
    const result = stage.isActive
      ? await apiPost<StageDTO>(`/api/v1/stages/${stage.id}/deactivate`)
      : await apiPatch<StageDTO>(`/api/v1/stages/${stage.id}`, { isActive: true });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setStages((list) => list.map((s) => (s.id === stage.id ? result.data : s)));
    toast.show({ message: stage.isActive ? 'مرحله غیرفعال شد.' : 'مرحله دوباره فعال شد.' });
    router.refresh();
  }

  function saved(stage: StageDTO) {
    setStages((list) =>
      list.some((s) => s.id === stage.id)
        ? list.map((s) => (s.id === stage.id ? stage : s))
        : [...list, stage],
    );
    toast.show({ message: editing === 'new' ? 'مرحله اضافه شد.' : 'مرحله ذخیره شد.' });
    setEditing(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-h2">
          <Icon name="route" className="text-fg-3" />
          مراحل مسیر
        </h2>
        <Button size="sm" variant="soft" aria-haspopup="dialog" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} />
          مرحله‌ی تازه
        </Button>
      </div>
      {error ? <Alert tone="error" role="alert" title={error} /> : null}
      {stages.length === 0 ? (
        <EmptyState icon="route" title="هنوز مرحله‌ای تعریف نشده" />
      ) : (
        <ol className="-mx-4 md:-mx-5">
          {stages.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                'flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 md:flex-nowrap md:px-5',
                !s.isActive && 'bg-surface-2',
              )}
            >
              <span className="inline-grid size-8 flex-none place-items-center rounded-sm border border-line-2 bg-surface text-sm font-extrabold text-fg-2">
                {s.displayCode}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {s.name}
                  {!s.isActive ? (
                    <Tag variant="outline" className="ms-2">
                      غیرفعال
                    </Tag>
                  ) : null}
                </p>
                <p className="text-sm text-fg-2">
                  {`مدت معمول: ${expected(s)}`}
                  {s.contentLinks.length ? ` · ${faNumber(s.contentLinks.length)} لینک محتوا` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1 max-md:w-full max-md:justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`بردن ${s.name} به بالا`}
                  disabled={i === 0 || busy !== null}
                  onClick={() => void move(i, -1)}
                >
                  <Icon name="chev-down" size={16} className="rotate-180" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`بردن ${s.name} به پایین`}
                  disabled={i === stages.length - 1 || busy !== null}
                  onClick={() => void move(i, 1)}
                >
                  <Icon name="chev-down" size={16} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-haspopup="dialog"
                  aria-label={`ویرایش ${s.name}`}
                  onClick={() => setEditing(s)}
                >
                  <Icon name="pen" size={16} />
                  ویرایش
                </Button>
                <Button
                  size="sm"
                  variant={s.isActive ? 'ghost' : 'soft'}
                  loading={busy === s.id}
                  onClick={() => void toggle(s)}
                >
                  {s.isActive ? 'غیرفعال کن' : 'فعال کن'}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'مرحله‌ی تازه' : editing ? `ویرایش «${editing.name}»` : ''}
      >
        {editing ? (
          <StageForm
            stage={editing === 'new' ? undefined : editing}
            onSaved={saved}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}

type LinkRow = { key: number; title: string; url: string };

function StageForm({
  stage,
  onSaved,
  onCancel,
}: {
  stage?: StageDTO;
  onSaved: (stage: StageDTO) => void;
  onCancel: () => void;
}) {
  const [displayCode, setDisplayCode] = useState(stage?.displayCode ?? '');
  const [name, setName] = useState(stage?.name ?? '');
  const [expectedDays, setExpectedDays] = useState(
    stage?.expectedDays === null || stage?.expectedDays === undefined
      ? ''
      : faNumber(stage.expectedDays),
  );
  const [isOpenEnded, setOpenEnded] = useState(stage?.isOpenEnded ?? false);
  const [description, setDescription] = useState(stage?.studentDescription ?? '');
  const [links, setLinks] = useState<LinkRow[]>(
    (stage?.contentLinks ?? []).map((l, i) => ({ key: i, title: l.title, url: l.url })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!displayCode.trim()) found.displayCode = 'برچسب مرحله را وارد کن (مثلاً ۳).';
    if (!name.trim()) found.name = 'نام مرحله را وارد کن.';
    const days = toLatinDigits(expectedDays.trim());
    if (days && !/^\d{1,4}$/.test(days)) found.expectedDays = 'تعداد روز را با عدد بنویس.';
    links.forEach((l, i) => {
      if (!l.title.trim() && !l.url.trim()) return;
      if (!l.title.trim()) found[`link-${i}-title`] = 'عنوان لینک را بنویس.';
      if (!isHttpsUrl(l.url)) found[`link-${i}-url`] = HTTPS_MESSAGE;
    });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    const body = {
      displayCode: displayCode.trim(),
      name: name.trim(),
      expectedDays: days ? Number(days) : null,
      isOpenEnded,
      studentDescription: description.trim() || null,
      contentLinks: links
        .filter((l) => l.title.trim() || l.url.trim())
        .map((l) => ({ title: l.title.trim(), url: l.url.trim() })),
    };
    setSubmitting(true);
    const result = stage
      ? await apiPatch<StageDTO>(`/api/v1/stages/${stage.id}`, body)
      : await apiPost<StageDTO>('/api/v1/stages', body);
    setSubmitting(false);
    if (result.ok) {
      onSaved(result.data);
      return;
    }
    const fields: Record<string, string> = {};
    let linkError: string | null = null;
    for (const [key, message] of Object.entries(result.error.fields)) {
      if (key.startsWith('contentLinks')) linkError = message;
      else fields[key] = message;
    }
    setErrors(fields);
    setFormError(
      linkError
        ? `لینک‌های محتوا: ${linkError}`
        : Object.keys(fields).length
          ? null
          : result.error.message,
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label={stage ? 'ویرایش مرحله' : 'مرحله‌ی تازه'}>
      {formError ? <Alert tone="error" role="alert" title={formError} /> : null}
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3">
        <TextField
          label="برچسب"
          value={displayCode}
          onChange={(e) => setDisplayCode(e.target.value)}
          error={errors.displayCode}
          maxLength={10}
        />
        <TextField
          label="نام مرحله"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
      </div>
      <TextField
        label="مدت معمول (روز)"
        optional
        inputMode="numeric"
        value={expectedDays}
        onChange={(e) => setExpectedDays(e.target.value)}
        error={errors.expectedDays}
        hint="کارت هنرجو بعد از این مدت در کانبان زرد و بعد از دو برابرش قرمز می‌شود."
        disabled={isOpenEnded}
      />
      <CheckboxField
        label="مرحله‌ی باز (پیوسته، بدون مدت)"
        checked={isOpenEnded}
        onChange={(e) => setOpenEnded(e.target.checked)}
      />
      <TextareaField
        label="خروجی این مرحله (برای هنرجو)"
        optional
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.studentDescription}
        className="min-h-[76px]"
      />
      <fieldset className="mb-5">
        <legend className="mb-1.5 text-ui font-semibold">
          لینک‌های محتوا <span className="font-normal text-fg-3">(اختیاری)</span>
        </legend>
        <div className="flex flex-col gap-3">
          {links.map((l, i) => (
            <div key={l.key} className="rounded-md border border-line bg-bg p-3">
              <TextField
                label={`عنوان لینک ${faNumber(i + 1)}`}
                value={l.title}
                onChange={(e) =>
                  setLinks((all) =>
                    all.map((x) => (x.key === l.key ? { ...x, title: e.target.value } : x)),
                  )
                }
                error={errors[`link-${i}-title`]}
                fieldClassName="mb-3"
              />
              <TextField
                label={`آدرس لینک ${faNumber(i + 1)}`}
                dir="ltr"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={l.url}
                onChange={(e) =>
                  setLinks((all) =>
                    all.map((x) => (x.key === l.key ? { ...x, url: e.target.value } : x)),
                  )
                }
                error={errors[`link-${i}-url`]}
                fieldClassName="mb-2"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLinks((all) => all.filter((x) => x.key !== l.key))}
              >
                <Icon name="x" size={16} />
                حذف این لینک
              </Button>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-3"
          onClick={() =>
            setLinks((all) => [...all, { key: (all.at(-1)?.key ?? -1) + 1, title: '', url: '' }])
          }
        >
          <Icon name="plus" size={16} />
          افزودن لینک
        </Button>
      </fieldset>
      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {stage ? 'ذخیره' : 'افزودن مرحله'}
        </Button>
      </DialogActions>
    </form>
  );
}
