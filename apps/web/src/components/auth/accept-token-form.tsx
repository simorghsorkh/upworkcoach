'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, pageLocale } from '@/components/api/client';
import { useFormat } from '@/components/format/use-format';
import { Button, ButtonLink } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { Alert, EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { translate } from '@/i18n/translate';
import type { MeDTO } from '@/server/auth/current-user';
import { PasswordField } from './password-field';
import { cleanPhoneInput, phoneError } from './phone';
import { homeFor } from './redirects';
import { useCountdown } from './use-countdown';

/**
 * G2 / G3 — accept an invitation or a password-reset link (security C1, ADR-0003 §2).
 * The token lives only in the URL fragment (`/invite#t=…`, `/reset#t=…`): it is read
 * once, removed from the address bar with history.replaceState, kept in memory, and
 * sent in the POST body. The user types their full mobile number as a second factor.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

type Lookup = { purpose: 'invite' | 'password_reset'; displayName: string; expiresAt: string };

type Phase =
  | { kind: 'checking' }
  | { kind: 'invalid' }
  | { kind: 'lookup-failed'; message: string }
  | { kind: 'ready'; info: Lookup }
  | { kind: 'done' };

type Errors = { phone?: string; password?: string; confirm?: string };

/** Reads `t` from the fragment and strips the fragment from the URL and history entry. */
export function takeTokenFromLocation(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash) {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }
  const token = new URLSearchParams(hash).get('t');
  return token?.trim() ? token.trim() : null;
}

export function validateNewPassword(password: string, confirm: string, min = PASSWORD_MIN) {
  const t = (key: string, params?: Record<string, number>) =>
    translate(pageLocale(), `auth.${key}`, params);
  const errors: { password?: string; confirm?: string } = {};
  if (!password) errors.password = t('newPasswordRequired');
  else if (Array.from(password).length < min) errors.password = t('passwordTooShort', { min });
  else if (Array.from(password).length > PASSWORD_MAX) errors.password = t('passwordTooLong');
  if (!errors.password && password !== confirm) errors.confirm = t('confirmMismatch');
  return errors;
}

export function AcceptTokenForm({
  onAccepted = (path) => window.location.assign(path),
}: {
  /** Navigation after success; injectable for tests. */
  onAccepted?: (path: string) => void;
}) {
  const t = useTranslations('accept');
  const format = useFormat();
  const tokenRef = useRef<string | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      setPhase({ kind: 'invalid' });
      return;
    }
    setPhase({ kind: 'checking' });
    const result = await apiPost<Lookup>('/api/v1/auth/tokens/lookup', { token });
    if (result.ok) setPhase({ kind: 'ready', info: result.data });
    else if (result.error.status === 410 || result.error.status === 404)
      setPhase({ kind: 'invalid' });
    else if (result.error.status === 429)
      setPhase({
        kind: 'lookup-failed',
        message: t('lookupTooMany', {
          wait: format.duration(result.error.retryAfterSeconds ?? 15 * 60),
        }),
      });
    else setPhase({ kind: 'lookup-failed', message: result.error.message });
  }, [t, format]);

  useEffect(() => {
    // Read once (StrictMode runs effects twice; the hash is already gone the second time).
    if (tokenRef.current === undefined) tokenRef.current = takeTokenFromLocation();
    void lookup();
    void apiGet<MeDTO>('/api/v1/auth/me').then((me) => {
      if (me.ok && me.data?.displayName) setSignedInAs(me.data.displayName);
    });
  }, [lookup]);

  if (phase.kind === 'checking' || phase.kind === 'done') {
    return (
      <div>
        <h1 className="sr-only">{t('checkingTitle')}</h1>
        <SkeletonRows rows={2} label={phase.kind === 'done' ? t('signingIn') : t('checking')} />
      </div>
    );
  }

  if (phase.kind === 'invalid') return <InvalidLink />;

  if (phase.kind === 'lookup-failed') {
    return (
      <>
        <h1 className="sr-only">{t('checkingTitle')}</h1>
        <ErrorState title={t('lookupFailed')} onRetry={() => void lookup()}>
          {phase.message}
        </ErrorState>
      </>
    );
  }

  return (
    <AcceptForm
      info={phase.info}
      token={tokenRef.current ?? ''}
      signedInAs={signedInAs}
      onInvalid={() => setPhase({ kind: 'invalid' })}
      onAccepted={(path) => {
        setPhase({ kind: 'done' });
        onAccepted(path);
      }}
    />
  );
}

export function InvalidLink() {
  const t = useTranslations('accept');
  return (
    <EmptyState
      icon="link"
      tone="error"
      headingLevel={1}
      title={t('invalidTitle')}
      action={
        <ButtonLink href="/login" variant="ghost">
          {t('signInWithPassword')}
        </ButtonLink>
      }
      className="py-4"
    >
      {t('invalidBody')}
    </EmptyState>
  );
}

function AcceptForm({
  info,
  token,
  signedInAs,
  onInvalid,
  onAccepted,
}: {
  info: Lookup;
  token: string;
  signedInAs: string | null;
  onInvalid: () => void;
  onAccepted: (path: string) => void;
}) {
  const t = useTranslations('accept');
  const tAuth = useTranslations('auth');
  const format = useFormat();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [lock, setLock] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const waitSeconds = useCountdown(lock);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const isInvite = info.purpose === 'invite';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || waitSeconds > 0) return;

    const found: Errors = { ...validateNewPassword(password, confirm) };
    const pErr = phoneError(phone);
    if (pErr) found.phone = pErr;
    setErrors(found);
    setFormError(null);
    if (found.phone) return phoneRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    if (found.confirm) return confirmRef.current?.focus();

    setSubmitting(true);
    const result = await apiPost<{ user: MeDTO }>('/api/v1/auth/tokens/accept', {
      token,
      phone: cleanPhoneInput(phone),
      password,
    });
    setSubmitting(false);

    if (result.ok) {
      onAccepted(homeFor(result.data.user.role));
      return;
    }
    const { error } = result;
    if (error.status === 410 || error.status === 404) return onInvalid();
    if (error.status === 422) {
      setErrors({ phone: error.fields.phone, password: error.fields.password });
      if (error.fields.phone) phoneRef.current?.focus();
      else if (error.fields.password) passwordRef.current?.focus();
      else setFormError(error.message);
      return;
    }
    if (error.status === 429 || error.status === 503) {
      setLock(Date.now() + (error.retryAfterSeconds ?? (error.status === 429 ? 900 : 10)) * 1000);
      setFormError(error.status === 429 ? t('linkLocked') : tAuth('busy'));
      return;
    }
    setFormError(error.message);
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="accept-title">
      <h1 id="accept-title" className="mb-1 text-xl">
        {isInvite ? t('inviteTitle', { name: info.displayName }) : t('resetTitle')}
      </h1>
      <p className="mb-6 text-ui text-fg-2">
        {isInvite ? t('inviteIntro') : t('resetIntro', { name: info.displayName })}
        <span className="mt-1 block text-sm text-fg-3">
          {t('validUntil', { date: format.dayMonth(new Date(info.expiresAt)) })}
        </span>
      </p>

      {signedInAs ? (
        <Alert tone="warn" title={t('otherAccountTitle')}>
          {t('otherAccountBody', { name: signedInAs })}
        </Alert>
      ) : null}

      {formError ? (
        <Alert tone="error" role="alert" title={formError}>
          {waitSeconds > 0 ? tAuth('tryAgainIn', { wait: format.duration(waitSeconds) }) : null}
        </Alert>
      ) : null}

      <TextField
        ref={phoneRef}
        label={t('phone')}
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="username"
        dir="ltr"
        placeholder="09123456789"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        hint={t('phoneHint')}
      />
      <PasswordField
        ref={passwordRef}
        label={isInvite ? tAuth('password') : t('newPassword')}
        name="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={t('passwordHint')}
      />
      <PasswordField
        ref={confirmRef}
        label={t('confirm')}
        name="confirm"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={submitting}
        disabled={waitSeconds > 0}
      >
        {submitting ? tAuth('submitting') : isInvite ? t('submitInvite') : t('submitReset')}
      </Button>

      <p className="mt-5 text-center text-sm text-fg-3">{t('privacy')}</p>
    </form>
  );
}
