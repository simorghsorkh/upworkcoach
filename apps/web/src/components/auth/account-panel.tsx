'use client';

import { type FormEvent, useRef, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { faDuration } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { roleLabel } from '@/components/shell/nav-items';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { MeDTO } from '@/server/auth/current-user';
import { validateNewPassword } from './accept-token-form';
import { logout } from './logout';
import { PasswordField } from './password-field';
import { useCountdown } from './use-countdown';

/** Minimum length by role (ADR-0003 §3: student 8, staff 12). */
export function minPasswordFor(role: MeDTO['role']): number {
  return role === 'student' ? 8 : 12;
}

/**
 * M12 / S10 «حساب من»: profile summary, change password, sign out, and — instead of a
 * delete button (security C5, ADR-0010) — one line telling the user to message the coach.
 */
export function AccountPanel({
  user,
  onLogout = logout,
}: {
  user: Pick<MeDTO, 'id' | 'displayName' | 'role' | 'phone'>;
  onLogout?: () => Promise<void> | void;
}) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <Card aria-labelledby="acc-me">
        <h2 id="acc-me" className="sr-only">
          مشخصات
        </h2>
        <div className="flex items-center gap-4">
          <Avatar id={user.id} name={user.displayName} size="lg" />
          <div className="min-w-0">
            <p className="text-lg font-bold">{user.displayName}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
              <span>{roleLabel[user.role]}</span>
              <span aria-hidden="true" className="text-line-2">
                ·
              </span>
              <bdi dir="ltr" className="tabular-nums">
                {user.phone}
              </bdi>
            </p>
          </div>
        </div>
      </Card>

      <Card aria-labelledby="acc-pw">
        <CardHead title="تغییر رمز" titleId="acc-pw" icon="lock" />
        <ChangePasswordForm minLength={minPasswordFor(user.role)} />
      </Card>

      <Card aria-labelledby="acc-out">
        <CardHead title="خروج" titleId="acc-out" icon="back" />
        <p className="mb-4 text-ui text-fg-2">
          از این دستگاه خارج می‌شوی. روی دستگاه مشترک حتماً خارج شو.
        </p>
        <Button
          variant="danger"
          loading={leaving}
          onClick={async () => {
            setLeaving(true);
            await onLogout();
          }}
        >
          <Icon name="back" size={16} />
          {leaving ? 'در حال خروج…' : 'خروج از حساب'}
        </Button>
      </Card>

      <p className="flex items-start gap-2 text-sm text-fg-3">
        <Icon name="info" size={16} className="mt-0.5" />
        برای حذف حساب به مربی‌ات پیام بده؛ حداکثر ظرف ۳۰ روز اطلاعاتت پاک و ناشناس می‌شود.
      </p>
    </div>
  );
}

type Errors = { current?: string; password?: string; confirm?: string };

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [lock, setLock] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const waitSeconds = useCountdown(lock);
  const currentRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || waitSeconds > 0) return;
    const found: Errors = { ...validateNewPassword(password, confirm, minLength) };
    if (!current) found.current = 'رمز فعلی‌ات را بنویس.';
    setErrors(found);
    setFormError(null);
    if (found.current) return currentRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    if (found.confirm) return confirmRef.current?.focus();

    setSubmitting(true);
    const result = await apiPost('/api/v1/auth/change-password', {
      currentPassword: current,
      newPassword: password,
    });
    setSubmitting(false);

    if (result.ok) {
      setCurrent('');
      setPassword('');
      setConfirm('');
      toast.show({ message: 'رمزت عوض شد. از دستگاه‌های دیگر خارج شدی.' });
      return;
    }
    const { error } = result;
    if (error.status === 401 || error.code === 'INVALID_CREDENTIALS') {
      setErrors({ current: 'رمز فعلی درست نیست.' });
      currentRef.current?.focus();
      return;
    }
    if (error.status === 422) {
      setErrors({
        current: error.fields.currentPassword,
        password: error.fields.newPassword,
      });
      if (!error.fields.currentPassword && !error.fields.newPassword) setFormError(error.message);
      return;
    }
    if (error.status === 429 || error.status === 503) {
      setLock(Date.now() + (error.retryAfterSeconds ?? (error.status === 429 ? 900 : 10)) * 1000);
      setFormError(error.status === 429 ? 'تلاش‌ها زیاد بود.' : 'سرور الان شلوغ است.');
      return;
    }
    setFormError(error.message);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="max-w-auth">
      {formError ? (
        <Alert tone="error" role="alert" title={formError}>
          {waitSeconds > 0 ? `${faDuration(waitSeconds)} دیگر دوباره امتحان کن.` : null}
        </Alert>
      ) : null}
      <PasswordField
        ref={currentRef}
        label="رمز فعلی"
        name="currentPassword"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={errors.current}
      />
      <PasswordField
        ref={passwordRef}
        label="رمز تازه"
        name="newPassword"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={`دست‌کم ${minLength.toLocaleString('fa-IR')} نویسه.`}
      />
      <PasswordField
        ref={confirmRef}
        label="تکرار رمز تازه"
        name="confirmPassword"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />
      <Button type="submit" variant="primary" loading={submitting} disabled={waitSeconds > 0}>
        {submitting ? 'در حال ثبت…' : 'ثبت رمز تازه'}
      </Button>
    </form>
  );
}
