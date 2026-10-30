'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPatch, apiPost } from '@/components/api/client';
import { CheckboxField } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type {
  CannedResponseCategory,
  CannedResponseDTO,
  MilestoneTypeDTO,
} from '@/modules/catalog/contracts';

/** "Milestone types" (F9, F11): rename, switch flags, deactivate; add a new type. */
export function MilestoneTypesSettings({ types }: { types: MilestoneTypeDTO[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<MilestoneTypeDTO | 'new' | null>(null);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="h-mt" className="text-h2">
          انواع نقطه‌ی عطف
        </h2>
        <Button size="sm" variant="ghost" aria-haspopup="dialog" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} />
          نوع تازه
        </Button>
      </div>
      <ul className="-mx-4 md:-mx-5">
        {types.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0 md:px-5"
          >
            <div className="min-w-0 flex-1">
              <p className={t.isActive ? 'font-semibold' : 'font-semibold text-fg-3 line-through'}>
                {t.name}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-1.5">
                {t.countsForNorthStar ? <Tag variant="gate">شاخص اصلی</Tag> : null}
                {t.requiresEvidence ? <Tag>مدرک لازم</Tag> : null}
                {t.uniquePerStudent ? <Tag>یک بار برای هر هنرجو</Tag> : null}
                {!t.isActive ? <Tag variant="outline">غیرفعال</Tag> : null}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-haspopup="dialog"
              onClick={() => setEditing(t)}
              aria-label={`ویرایش ${t.name}`}
            >
              <Icon name="pen" size={16} />
            </Button>
          </li>
        ))}
      </ul>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'نوع تازه' : 'ویرایش نوع'}
      >
        {editing ? (
          <TypeForm
            type={editing === 'new' ? null : editing}
            onDone={() => {
              setEditing(null);
              toast.show({ message: 'ذخیره شد.' });
              router.refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function TypeForm({
  type,
  onDone,
  onCancel,
}: {
  type: MilestoneTypeDTO | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(type?.name ?? '');
  const [north, setNorth] = useState(type?.countsForNorthStar ?? false);
  const [evidence, setEvidence] = useState(type?.requiresEvidence ?? false);
  const [unique, setUnique] = useState(type?.uniquePerStudent ?? true);
  const [active, setActive] = useState(type?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError('نام نوع را بنویس.');
      return;
    }
    setSaving(true);
    const body = {
      name: name.trim(),
      countsForNorthStar: north,
      requiresEvidence: evidence,
      uniquePerStudent: unique,
      isActive: active,
    };
    const res = type
      ? await apiPatch(`/api/v1/milestone-types/${type.id}`, body)
      : await apiPost('/api/v1/milestone-types', body);
    setSaving(false);
    if (res.ok) onDone();
    else setError(res.error.fields.name ?? res.error.message);
  }
  return (
    <form noValidate onSubmit={onSubmit}>
      <TextField
        label="نام"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
        maxLength={120}
      />
      <CheckboxField
        label="شاخص اصلی (در «نتایج» شمرده شود)"
        checked={north}
        onChange={(e) => setNorth(e.target.checked)}
      />
      <CheckboxField
        label="پیشنهاد هنرجو مدرک لازم دارد"
        checked={evidence}
        onChange={(e) => setEvidence(e.target.checked)}
      />
      <CheckboxField
        label="برای هر هنرجو فقط یک بار"
        checked={unique}
        onChange={(e) => setUnique(e.target.checked)}
      />
      <CheckboxField label="فعال" checked={active} onChange={(e) => setActive(e.target.checked)} />
      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="primary" loading={saving}>
          ذخیره
        </Button>
      </DialogActions>
    </form>
  );
}

const CATEGORY_LABEL: Record<CannedResponseCategory, string> = {
  red_line: 'خط قرمز',
  general: 'عمومی',
};

/** "Standard texts" (F8, F11): canned answers staff insert in a reply. */
export function CannedResponsesSettings({ items }: { items: CannedResponseDTO[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<CannedResponseDTO | 'new' | null>(null);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="h-cr" className="text-h2">
          متن‌های استاندارد
        </h2>
        <Button size="sm" variant="ghost" aria-haspopup="dialog" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} />
          متن تازه
        </Button>
      </div>
      <ul className="-mx-4 md:-mx-5">
        {items.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-3 border-t border-line px-4 py-2.5 first:border-t-0 md:px-5"
          >
            <div className="min-w-0 flex-1">
              <p className={c.isActive ? 'font-semibold' : 'font-semibold text-fg-3'}>
                {c.title}{' '}
                <Tag variant={c.category === 'red_line' ? 'late' : 'neutral'} icon={null}>
                  {CATEGORY_LABEL[c.category]}
                </Tag>
                {!c.isActive ? (
                  <Tag variant="outline" className="ms-1">
                    غیرفعال
                  </Tag>
                ) : null}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm text-fg-2">{c.body}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-haspopup="dialog"
              onClick={() => setEditing(c)}
              aria-label={`ویرایش ${c.title}`}
            >
              <Icon name="pen" size={16} />
            </Button>
          </li>
        ))}
      </ul>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'متن استاندارد تازه' : 'ویرایش متن'}
      >
        {editing ? (
          <CannedForm
            item={editing === 'new' ? null : editing}
            onDone={() => {
              setEditing(null);
              toast.show({ message: 'ذخیره شد.' });
              router.refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function CannedForm({
  item,
  onDone,
  onCancel,
}: {
  item: CannedResponseDTO | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [category, setCategory] = useState<CannedResponseCategory>(item?.category ?? 'general');
  const [active, setActive] = useState(item?.isActive ?? true);
  const [errors, setErrors] = useState<{ title?: string; body?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'عنوان را بنویس.';
    if (!body.trim()) next.body = 'متن پاسخ را بنویس.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    const data = { title: title.trim(), body: body.trim(), category, isActive: active };
    const res = item
      ? await apiPatch(`/api/v1/canned-responses/${item.id}`, data)
      : await apiPost('/api/v1/canned-responses', data);
    setSaving(false);
    if (res.ok) onDone();
    else
      setErrors({
        title: res.error.fields.title,
        body: res.error.fields.body,
        form: res.error.fields.title || res.error.fields.body ? undefined : res.error.message,
      });
  }
  return (
    <form noValidate onSubmit={onSubmit}>
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      <TextField
        label="عنوان"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        maxLength={120}
      />
      <SelectField
        label="دسته"
        value={category}
        onChange={(e) => setCategory(e.target.value as CannedResponseCategory)}
      >
        <option value="general">عمومی</option>
        <option value="red_line">خط قرمز</option>
      </SelectField>
      <TextareaField
        label="متن پاسخ"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={errors.body}
        className="min-h-36"
        maxLength={5000}
      />
      <CheckboxField label="فعال" checked={active} onChange={(e) => setActive(e.target.checked)} />
      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="primary" loading={saving}>
          ذخیره
        </Button>
      </DialogActions>
    </form>
  );
}
