'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPatch, apiPost } from '@/components/api/client';
import { toLatinDigits } from '@/components/format/fa';
import { CheckboxField } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { PlatformBadge } from '@/components/ui/platform';
import { Alert, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { PlatformDTO, TrackDTO } from '@/modules/catalog/contracts';

/**
 * M11 «پلتفرم‌ها» (admin): add a platform without a code change (F2), rename, attach to a
 * track, order, deactivate. Names are unique regardless of case (422 `fields.name`).
 */
export function PlatformsSettings({
  platforms: initial,
  tracks,
}: {
  platforms: PlatformDTO[];
  tracks: TrackDTO[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [platforms, setPlatforms] = useState(initial);
  const [editing, setEditing] = useState<PlatformDTO | 'new' | null>(null);
  const trackName = new Map(tracks.map((t) => [t.id, `${t.code} ${t.name}`]));

  function saved(p: PlatformDTO) {
    setPlatforms((list) =>
      (list.some((x) => x.id === p.id)
        ? list.map((x) => (x.id === p.id ? p : x))
        : [...list, p]
      ).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    );
    toast.show({ message: editing === 'new' ? 'پلتفرم اضافه شد.' : 'پلتفرم ذخیره شد.' });
    setEditing(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-h2">
          <Icon name="briefcase" className="text-fg-3" />
          پلتفرم‌ها
        </h2>
        <Button size="sm" variant="soft" aria-haspopup="dialog" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} />
          پلتفرم تازه
        </Button>
      </div>
      {platforms.length === 0 ? (
        <EmptyState icon="briefcase" title="هنوز پلتفرمی تعریف نشده" />
      ) : (
        <ul className="-mx-4 md:-mx-5">
          {platforms.map((p) => (
            <li
              key={p.id}
              className={cn(
                'flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 md:px-5',
                !p.isActive && 'bg-surface-2',
              )}
            >
              <PlatformBadge name={p.name} />
              <span className="min-w-0 flex-1 text-sm text-fg-2">
                {p.trackId ? `شاخه: ${trackName.get(p.trackId) ?? '—'}` : 'بدون شاخه'}
              </span>
              {!p.isActive ? <Tag variant="outline">غیرفعال</Tag> : null}
              <Button
                size="sm"
                variant="ghost"
                aria-haspopup="dialog"
                aria-label={`ویرایش ${p.name}`}
                onClick={() => setEditing(p)}
              >
                <Icon name="pen" size={16} />
                ویرایش
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'پلتفرم تازه' : editing ? `ویرایش ${editing.name}` : ''}
      >
        {editing ? (
          <PlatformForm
            platform={editing === 'new' ? undefined : editing}
            tracks={tracks}
            onSaved={saved}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function PlatformForm({
  platform,
  tracks,
  onSaved,
  onCancel,
}: {
  platform?: PlatformDTO;
  tracks: TrackDTO[];
  onSaved: (p: PlatformDTO) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(platform?.name ?? '');
  const [trackId, setTrackId] = useState(platform?.trackId ?? '');
  const [sortOrder, setSortOrder] = useState(platform ? String(platform.sortOrder) : '');
  const [isActive, setActive] = useState(platform?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = 'نام پلتفرم را وارد کن.';
    const order = toLatinDigits(sortOrder.trim());
    if (order && !/^\d{1,5}$/.test(order)) found.sortOrder = 'ترتیب را با عدد بنویس.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const body: Record<string, unknown> = { name: name.trim(), trackId: trackId || null, isActive };
    if (order) body.sortOrder = Number(order);
    setSubmitting(true);
    const result = platform
      ? await apiPatch<PlatformDTO>(`/api/v1/platforms/${platform.id}`, body)
      : await apiPost<PlatformDTO>('/api/v1/platforms', body);
    setSubmitting(false);
    if (result.ok) {
      onSaved(result.data);
      return;
    }
    setErrors(result.error.fields);
    setFormError(Object.keys(result.error.fields).length ? null : result.error.message);
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label={platform ? 'ویرایش پلتفرم' : 'پلتفرم تازه'}>
      {formError ? <Alert tone="error" role="alert" title={formError} /> : null}
      <TextField
        label="نام"
        dir="auto"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <SelectField
        label="شاخه"
        optional
        value={trackId}
        onChange={(e) => setTrackId(e.target.value)}
        error={errors.trackId}
      >
        <option value="">بدون شاخه</option>
        {tracks.map((t) => (
          <option key={t.id} value={t.id}>
            {`${t.code} ${t.name}`}
          </option>
        ))}
      </SelectField>
      <TextField
        label="ترتیب نمایش"
        optional
        inputMode="numeric"
        dir="ltr"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        error={errors.sortOrder}
        hint="عدد کوچک‌تر بالاتر می‌آید."
      />
      <CheckboxField
        label="فعال (در فرم‌ها قابل انتخاب است)"
        checked={isActive}
        onChange={(e) => setActive(e.target.checked)}
      />
      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {platform ? 'ذخیره' : 'افزودن پلتفرم'}
        </Button>
      </DialogActions>
    </form>
  );
}
