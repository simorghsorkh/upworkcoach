'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { type ApiResult, apiPost } from '@/components/api/client';
import { useFormat } from '@/components/format/use-format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/states';
import { PasswordField } from './password-field';

/** `403 REAUTH_REQUIRED` (SEC-S7, followup F-06): the action needs a password from the last 30 min. */
export function isReauthRequired(result: ApiResult<unknown>): boolean {
  return !result.ok && result.error.status === 403 && result.error.code === 'REAUTH_REQUIRED';
}

/**
 * "Enter your password again to continue": `POST /api/v1/auth/reauth`, then the caller repeats the
 * original request. Wrong password → the message next to the field; `429` → the wait time.
 */
export function ReauthDialog({
  open,
  onConfirmed,
  onCancel,
}: {
  open: boolean;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('reauth');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const format = useFormat();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (!password) {
      setError(tAuth('passwordRequired'));
      return;
    }
    setSending(true);
    setError(null);
    setFormError(null);
    const res = await apiPost('/api/v1/auth/reauth', { password });
    setSending(false);
    if (res.ok) {
      setPassword('');
      onConfirmed();
      return;
    }
    if (res.error.status === 422) {
      setError(res.error.fields.password ?? t('wrong'));
    } else if (res.error.status === 429) {
      setFormError(
        res.error.retryAfterSeconds
          ? t('tooMany', { wait: format.duration(res.error.retryAfterSeconds) })
          : res.error.message,
      );
    } else {
      setFormError(res.error.message);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setPassword('');
        setError(null);
        setFormError(null);
        onCancel();
      }}
      title={t('title')}
      description={t('description')}
    >
      <form noValidate onSubmit={onSubmit}>
        {formError ? <Alert tone="error" role="alert" title={formError} /> : null}
        <PasswordField
          label={tAuth('password')}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          autoFocus
        />
        <DialogActions>
          <Button onClick={onCancel}>{tCommon('cancel')}</Button>
          <Button type="submit" variant="primary" loading={sending}>
            {t('confirm')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * `const reauth = useReauth()`; send with `reauth.run(() => apiPost(...))` and render
 * `{reauth.dialog}`. On `REAUTH_REQUIRED` the dialog opens; after a correct password the same
 * request is sent again and its result returned. Cancel returns the original `403`.
 */
export function useReauth(): {
  run: <T>(send: () => Promise<ApiResult<T>>) => Promise<ApiResult<T>>;
  dialog: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  async function run<T>(send: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    const first = await send();
    if (!isReauthRequired(first)) return first;
    const confirmed = await new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setOpen(true);
    });
    if (!confirmed) return first;
    return send();
  }

  const finish = (confirmed: boolean) => {
    setOpen(false);
    pending.current?.(confirmed);
    pending.current = null;
  };

  return {
    run,
    dialog: (
      <ReauthDialog open={open} onConfirmed={() => finish(true)} onCancel={() => finish(false)} />
    ),
  };
}
