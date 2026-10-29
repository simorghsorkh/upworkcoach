'use client';

import { type ReactNode, useState } from 'react';
import { type ApiResult, fallbackMessage, pageLocale } from '@/components/api/client';
import { useReauth } from '@/components/auth/reauth-dialog';
import { Icon, type IconName } from '@/components/icons/icon';
import { Button, type ButtonVariant } from '@/components/ui/button';

async function fetchFile(path: string): Promise<ApiResult<Blob>> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept-Language': pageLocale() },
    });
  } catch {
    return {
      ok: false,
      error: { status: 0, code: 'NETWORK', message: fallbackMessage(0), fields: {} },
    };
  }
  if (res.ok) return { ok: true, status: res.status, data: await res.blob() };
  let body: { error?: { code?: string; message?: string } } = {};
  try {
    body = await res.json();
  } catch {
    // not JSON
  }
  return {
    ok: false,
    error: {
      status: res.status,
      code: body.error?.code ?? `HTTP_${res.status}`,
      message: body.error?.message || fallbackMessage(res.status),
      fields: {},
    },
  };
}

/**
 * CSV export through `fetch` (not a bare `<a href>`), so `403 REAUTH_REQUIRED` (SEC-S7) opens
 * the password dialog and the download continues afterwards; other errors are shown inline.
 */
export function CsvDownloadButton({
  href,
  filename,
  icon = 'file',
  variant,
  size,
  onDone,
  children,
}: {
  href: string;
  filename: string;
  icon?: IconName;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  onDone?: () => void;
  children: ReactNode;
}) {
  const reauth = useReauth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    const res = await reauth.run(() => fetchFile(href));
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error.code === 'REAUTH_REQUIRED'
          ? 'بدون تأیید دوباره‌ی رمز، فایل دانلود نمی‌شود.'
          : res.error.message,
      );
      return;
    }
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    onDone?.();
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant={variant} size={size} loading={busy} onClick={() => void download()}>
        <Icon name={icon} size={16} />
        {children}
      </Button>
      {error ? (
        <span role="alert" className="text-sm font-semibold text-h-red-fg">
          {error}
        </span>
      ) : null}
      {reauth.dialog}
    </span>
  );
}
