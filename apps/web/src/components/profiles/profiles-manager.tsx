'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiDelete, apiPost } from '@/components/api/client';
import { faDayMonth } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { profileKindLabel } from '@/components/students/labels';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { ExternalLink, LtrBlock } from '@/components/ui/ltr';
import { PlatformBadge } from '@/components/ui/platform';
import { Alert, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { PlatformDTO } from '@/modules/catalog/contracts';
import type { ProfileDTO } from '@/modules/students/contracts';
import { formatRate, ProfileStatusChip } from './profile-display';
import { ProfileForm } from './profile-form';

type Editing = { kind: 'new' } | { kind: 'edit'; profile: ProfileDTO } | null;

/**
 * "Showcases" — list, add, edit, delete (and approve for staff). Mutations go through the API
 * (SEC-A10) and the server page is refreshed so the header follows.
 */
export function ProfilesManager({
  mode,
  profiles,
  platforms,
  createUrl,
  ownerName,
  headingId,
}: {
  mode: 'staff' | 'student';
  profiles: ProfileDTO[];
  platforms: PlatformDTO[];
  createUrl: string;
  /** Student's first name in staff mode ("New showcase for Amir"). */
  ownerName?: string;
  headingId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(profiles);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ProfileDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setItems(profiles), [profiles]);

  const platformsForForm = (current?: ProfileDTO) =>
    current && !platforms.some((p) => p.id === current.platform.id)
      ? [...platforms, { ...current.platform, trackId: null, sortOrder: 0, isActive: false }]
      : platforms;

  function saved(profile: ProfileDTO) {
    setItems((list) => {
      const others = list
        .filter((p) => p.id !== profile.id)
        .map((p) => (profile.isPrimary ? { ...p, isPrimary: false } : p));
      return profile.isPrimary ? [profile, ...others] : [...others, profile];
    });
    toast.show({ message: editing?.kind === 'edit' ? 'ویترین به‌روز شد.' : 'ویترین اضافه شد.' });
    setEditing(null);
    router.refresh();
  }

  async function remove(profile: ProfileDTO) {
    setBusy(profile.id);
    setError(null);
    const result = await apiDelete(`/api/v1/profiles/${profile.id}`);
    setBusy(null);
    setDeleting(null);
    if (result.ok || result.error.status === 404) {
      setItems((list) => list.filter((p) => p.id !== profile.id));
      toast.show({ message: 'ویترین حذف شد.' });
      router.refresh();
      return;
    }
    setError(result.error.message);
  }

  async function approve(profile: ProfileDTO) {
    setBusy(profile.id);
    setError(null);
    const result = await apiPost<ProfileDTO>(`/api/v1/profiles/${profile.id}/approve`);
    setBusy(null);
    if (result.ok) {
      setItems((list) => list.map((p) => (p.id === profile.id ? result.data : p)));
      toast.show({ message: 'ویترین تأیید شد.' });
      router.refresh();
      return;
    }
    setError(result.error.message);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="flex items-center gap-2 text-h2">
          <Icon name="briefcase" className="text-fg-3" />
          {mode === 'staff' ? 'ویترین‌ها' : 'پروفایل‌های من'}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          aria-haspopup="dialog"
          onClick={() => setEditing({ kind: 'new' })}
        >
          <Icon name="plus" size={16} />
          افزودن
        </Button>
      </div>

      {error ? <Alert tone="error" role="alert" title={error} /> : null}

      {items.length === 0 ? (
        <EmptyState icon="briefcase" tone="brand" title="هنوز ویترینی ثبت نشده" className="py-6">
          {mode === 'staff'
            ? 'لینک پروفایل Upwork، گیگ Fiverr یا صفحه‌ی LinkedIn را این‌جا نگه دار.'
            : 'اگر در Upwork، Fiverr یا LinkedIn پروفایلی داری، لینکش را اضافه کن.'}
        </EmptyState>
      ) : (
        <ul className="-mx-4 md:-mx-5">
          {items.map((p) => (
            <li
              key={p.id}
              className="border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover md:px-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <PlatformBadge name={p.platform.name} />
                <span className="font-semibold">{profileKindLabel[p.kind]}</span>
                <ProfileStatusChip status={p.status} />
                {p.isPrimary ? <Tag variant="gate">اصلی</Tag> : null}
              </div>
              {p.headline ? (
                <LtrBlock compact className="my-2">
                  {p.headline}
                </LtrBlock>
              ) : null}
              {p.publicUrl ? (
                <div className="mt-1">
                  <ExternalLink href={p.publicUrl} />
                </div>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
                {formatRate(p) ? <span>{formatRate(p)}</span> : null}
                {p.niche ? (
                  <>
                    {formatRate(p) ? <span className="text-line-2">·</span> : null}
                    <span>
                      نیچ: <bdi>{p.niche}</bdi>
                    </span>
                  </>
                ) : null}
                {p.mentorApprovedAt ? (
                  <>
                    <span className="text-line-2">·</span>
                    <span>{`تأیید مشاور: ${faDayMonth(new Date(p.mentorApprovedAt))}`}</span>
                  </>
                ) : null}
                <span className="text-line-2">·</span>
                <span>{`ویرایش: ${faDayMonth(new Date(p.updatedAt))}`}</span>
              </div>
              {p.notes ? (
                <p className="mt-1 text-sm text-fg-2 whitespace-pre-line">{p.notes}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-haspopup="dialog"
                  aria-label={`ویرایش ویترین ${p.platform.name}`}
                  onClick={() => setEditing({ kind: 'edit', profile: p })}
                >
                  <Icon name="pen" size={16} />
                  ویرایش
                </Button>
                {mode === 'staff' && !p.mentorApprovedAt ? (
                  <Button
                    size="sm"
                    variant="soft"
                    loading={busy === p.id}
                    aria-label={`تأیید ویترین ${p.platform.name}`}
                    onClick={() => void approve(p)}
                  >
                    <Icon name="check" size={16} />
                    تأیید
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-haspopup="dialog"
                  aria-label={`حذف ویترین ${p.platform.name}`}
                  onClick={() => setDeleting(p)}
                  className="text-h-red-fg hover:text-h-red-fg [&_svg]:text-h-red-fg"
                >
                  <Icon name="x" size={16} />
                  حذف
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing?.kind === 'edit'
            ? `ویرایش ویترین ${editing.profile.platform.name}`
            : ownerName
              ? `ویترین تازه برای ${ownerName}`
              : 'پروفایل تازه'
        }
      >
        {editing ? (
          <ProfileForm
            mode={mode}
            createUrl={createUrl}
            platforms={platformsForForm(editing.kind === 'edit' ? editing.profile : undefined)}
            profile={editing.kind === 'edit' ? editing.profile : undefined}
            onSaved={saved}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="حذف ویترین؟"
        description={
          deleting ? `${deleting.platform.name} · ${profileKindLabel[deleting.kind]}` : undefined
        }
      >
        <p className="mb-4 text-ui text-fg-2">
          ویترین از پرونده برداشته می‌شود. خود حساب در پلتفرم دست نمی‌خورد.
        </p>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>انصراف</Button>
          <Button
            variant="danger-solid"
            loading={deleting !== null && busy === deleting.id}
            onClick={() => deleting && void remove(deleting)}
          >
            حذف کن
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
