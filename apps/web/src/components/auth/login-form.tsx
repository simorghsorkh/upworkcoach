'use client';

import Link from 'next/link';
import { type FormEvent, useRef, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { faDuration } from '@/components/format/fa';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import type { MeDTO } from '@/server/auth/current-user';
import { PasswordField } from './password-field';
import { cleanPhoneInput, phoneError } from './phone';
import { homeFor, safeNext } from './redirects';
import { useCountdown } from './use-countdown';

type Errors = { phone?: string; password?: string };

/**
 * G1 — sign in with mobile + password (api.md §2 `POST /auth/login`).
 * Errors: 401 INVALID_CREDENTIALS, 422 per-field, 429 with wait time, 503 busy, network.
 */
export function LoginForm({
  next,
  onSignedIn = (path) => window.location.assign(path),
}: {
  next?: string | null;
  /** Navigation after success; injectable for tests. */
  onSignedIn?: (path: string) => void;
}) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [lock, setLock] = useState<{ until: number; reason: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const waitSeconds = useCountdown(lock?.until ?? null);
  const locked = waitSeconds > 0;
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || locked) return;

    const found: Errors = {};
    const pErr = phoneError(phone);
    if (pErr) found.phone = pErr;
    if (!password) found.password = 'رمزت را بنویس.';
    setErrors(found);
    setFormError(null);
    if (found.phone) return phoneRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();

    setSubmitting(true);
    const result = await apiPost<{ user: MeDTO }>('/api/v1/auth/login', {
      phone: cleanPhoneInput(phone),
      password,
    });
    setSubmitting(false);

    if (result.ok) {
      onSignedIn(safeNext(next) ?? homeFor(result.data.user.role));
      return;
    }

    const { error } = result;
    switch (error.status) {
      case 401:
        setFormError('شماره‌ی موبایل یا رمز درست نیست.');
        passwordRef.current?.select();
        return;
      case 422:
        setErrors({ phone: error.fields.phone, password: error.fields.password });
        if (!error.fields.phone && !error.fields.password) setFormError(error.message);
        return;
      case 429:
      case 503: {
        const seconds = error.retryAfterSeconds ?? (error.status === 429 ? 15 * 60 : 10);
        setLock({
          until: Date.now() + seconds * 1000,
          reason:
            error.status === 429
              ? 'تلاش‌های ناموفق زیاد بود و ورود موقتاً بسته شد.'
              : 'سرور الان شلوغ است.',
        });
        return;
      }
      default:
        setFormError(error.message);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="login-title">
      <h1 id="login-title" className="mb-1 text-xl">
        ورود
      </h1>
      <p className="mb-6 text-ui text-fg-2">با شماره‌ی موبایل و رمزی که موقع پذیرش دعوت گذاشتی.</p>

      {locked && lock ? (
        <Alert tone="error" role="alert" title={lock.reason}>
          {`${faDuration(waitSeconds)} دیگر دوباره امتحان کن.`}
        </Alert>
      ) : formError ? (
        <Alert tone="error" role="alert" title={formError} />
      ) : null}

      <TextField
        ref={phoneRef}
        label="شماره‌ی موبایل"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="username"
        dir="ltr"
        placeholder="09123456789"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        hint="ارقام فارسی یا انگلیسی، هر دو قبول است."
      />
      <PasswordField
        ref={passwordRef}
        label="رمز"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={submitting}
        disabled={locked}
      >
        {submitting ? 'در حال ورود…' : 'ورود'}
      </Button>

      <p className="mt-5 text-center text-ui">
        <Link href="/forgot" className="font-semibold text-link hover:underline">
          رمزت را فراموش کرده‌ای؟
        </Link>
      </p>
    </form>
  );
}
