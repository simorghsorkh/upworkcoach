'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { apiUpload } from '@/components/api/client';
import { Icon } from '@/components/icons/icon';
import type { AttachmentUploadedDTO } from '@/modules/files/contracts';

/**
 * Image attachments for questions and milestone evidence (C4): each file goes to
 * `POST /attachments` at once (status `pending`), and the form sends the ids it got back.
 * Same rules as the task submission form: JPG, PNG or WebP up to 5 MB, at most 10.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILES = 10;

export type Upload = {
  key: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  preview: string | null;
  id?: string;
  error?: string;
};

function uploadError(status: number, message: string): string {
  if (status === 413) return 'حجم تصویر بیش از ۵ مگابایت است.';
  if (status === 415) return 'فقط تصویر JPG، PNG یا WebP.';
  if (status === 429) return 'تعداد آپلودهایت زیاد بود؛ کمی بعد دوباره امتحان کن.';
  return message;
}

export function useImageUploads() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const previews = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const files = [...list].slice(0, Math.max(0, MAX_FILES - uploads.length));
    for (const f of files) {
      const key = `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`;
      const invalid = !TYPES.includes(f.type)
        ? 'فقط تصویر JPG، PNG یا WebP.'
        : f.size > MAX_BYTES
          ? 'حجم تصویر بیش از ۵ مگابایت است.'
          : null;
      if (invalid) {
        setUploads((u) => [
          ...u,
          { key, name: f.name, status: 'error', preview: null, error: invalid },
        ]);
        continue;
      }
      const preview = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : null;
      if (preview) previews.current.push(preview);
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
  }

  return {
    uploads,
    add,
    remove: (key: string) => setUploads((u) => u.filter((y) => y.key !== key)),
    clear: () => setUploads([]),
    ids: uploads.filter((u) => u.status === 'done' && u.id).map((u) => u.id as string),
    busy: uploads.some((u) => u.status === 'uploading'),
  };
}

export function ImageUploadField({
  label,
  hint,
  error,
  state,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  state: ReturnType<typeof useImageUploads>;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-1.5 block text-ui font-semibold">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => {
          void state.add(e.target.files).then(() => {
            if (ref.current) ref.current.value = '';
          });
        }}
        aria-describedby={`${id}-hint`}
        className="block w-full cursor-pointer rounded-sm border border-line-strong bg-surface text-ui file:me-3 file:cursor-pointer file:border-0 file:border-e file:border-line file:bg-surface-2 file:px-3 file:py-2.5 file:font-semibold"
      />
      <p id={`${id}-hint`} className="mt-1.5 flex items-start gap-1.5 text-sm text-fg-3">
        <Icon name="eye" size={16} className="mt-0.5 flex-none" />
        {hint ?? 'JPG، PNG یا WebP تا ۵ مگابایت. پیش از آپلود، نام و عکس کارفرما را بپوشان.'}
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-h-red-fg"
        >
          <Icon name="alert" size={16} />
          {error}
        </p>
      ) : null}
      {state.uploads.length ? (
        <ul aria-label="تصویرهای پیوست" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {state.uploads.map((u) => (
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
                  onClick={() => state.remove(u.key)}
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
  );
}

/** Attachments of a message or a milestone (served by our API only). */
export function AttachmentThumbs({
  items,
}: {
  items: Array<{ id: string; href: string; originalName: string }>;
}) {
  if (!items.length) return null;
  return (
    <ul aria-label="تصویرها" className="mt-2 flex flex-wrap gap-2">
      {items.map((a) => (
        <li key={a.id}>
          <a
            href={a.href}
            target="_blank"
            rel="noopener"
            className="block overflow-hidden rounded-sm border border-line hover:border-primary-line"
          >
            {/* biome-ignore lint/performance/noImgElement: authenticated API image */}
            <img
              src={a.href}
              alt={a.originalName}
              loading="lazy"
              className="size-24 object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
