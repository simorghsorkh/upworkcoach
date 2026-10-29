'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { apiPost, apiRequest } from '@/components/api/client';
import { useFormat } from '@/components/format/use-format';
import { Icon } from '@/components/icons/icon';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { type Locale, SUPPORTED_LOCALES } from '@/i18n/config';
import type { OrganizationOptionDTO } from '@/modules/identity/contracts';
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
  organizations = [],
  onLogout = logout,
}: {
  user: Pick<MeDTO, 'id' | 'displayName' | 'role' | 'phone'>;
  /** Active memberships of the account (ADR-0011); the switch shows when there are two+. */
  organizations?: readonly OrganizationOptionDTO[];
  onLogout?: () => Promise<void> | void;
}) {
  const [leaving, setLeaving] = useState(false);
  const t = useTranslations('account');
  const tRole = useTranslations('role');
  return (
    <div className="flex flex-col gap-5">
      <Card aria-labelledby="acc-me">
        <h2 id="acc-me" className="sr-only">
          {t('profile')}
        </h2>
        <div className="flex items-center gap-4">
          <Avatar id={user.id} name={user.displayName} size="lg" />
          <div className="min-w-0">
            <p className="text-lg font-bold">{user.displayName}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
              <span>{tRole(user.role)}</span>
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

      {organizations.length > 0 && <OrganizationCard organizations={organizations} />}

      <LanguageCard />

      <Card aria-labelledby="acc-pw">
        <CardHead title={t('changePassword')} titleId="acc-pw" icon="lock" />
        <ChangePasswordForm minLength={minPasswordFor(user.role)} />
      </Card>

      <Card aria-labelledby="acc-out">
        <CardHead title={t('logoutTitle')} titleId="acc-out" icon="back" />
        <p className="mb-4 text-ui text-fg-2">{t('logoutBody')}</p>
        <Button
          variant="danger"
          loading={leaving}
          onClick={async () => {
            setLeaving(true);
            await onLogout();
          }}
        >
          <Icon name="back" size={16} />
          {leaving ? t('loggingOut') : t('logoutButton')}
        </Button>
      </Card>

      <p className="flex items-start gap-2 text-sm text-fg-3">
        <Icon name="info" size={16} className="mt-0.5" />
        {t('deleteNote')}
      </p>
    </div>
  );
}

/**
 * Interface language of the account (ADR-0013): `PATCH /auth/preferences`, then a full reload
 * so server-rendered text, `lang` and `dir` all follow.
 */
export function LanguageCard() {
  const t = useTranslations('account');
  const locale = useLocale();
  const [pending, setPending] = useState<Locale | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: Locale) {
    if (next === locale || pending) return;
    setPending(next);
    setError(null);
    const result = await apiRequest('PATCH', '/api/v1/auth/preferences', { locale: next });
    if (result.ok) {
      window.location.reload();
      return;
    }
    setPending(null);
    setError(result.error.message);
  }

  return (
    <Card aria-labelledby="acc-lang">
      <CardHead title={t('language')} titleId="acc-lang" icon="info" />
      <p className="mb-3 text-ui text-fg-2">{t('languageHint')}</p>
      <div className="flex flex-wrap gap-2">
        {SUPPORTED_LOCALES.map((option) => (
          <Button
            key={option}
            lang={option}
            variant={option === locale ? 'primary' : 'secondary'}
            aria-pressed={option === locale}
            loading={pending === option}
            disabled={pending !== null}
            onClick={() => void choose(option)}
          >
            {t(`languageName.${option}`)}
          </Button>
        ))}
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="error" role="alert" title={error} />
        </div>
      )}
    </Card>
  );
}

/**
 * The organization this session works in (ADR-0011). An account in several organizations
 * (e.g. a mentor of two academies) switches here; the session is rotated and the page
 * reloads on the home of the new role, so nothing of the old organization stays on screen.
 */
export function OrganizationCard({
  organizations,
}: {
  organizations: readonly OrganizationOptionDTO[];
}) {
  const t = useTranslations('account');
  const tRole = useTranslations('organizationRole');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = organizations.find((o) => o.current);
  const others = organizations.filter((o) => !o.current);

  async function switchTo(id: string) {
    setPending(id);
    setError(null);
    const result = await apiPost<{ user: MeDTO }>('/api/v1/auth/organization', {
      organizationId: id,
    });
    if (result.ok) {
      window.location.assign(result.data.user.role === 'student' ? '/home' : '/today');
      return;
    }
    setPending(null);
    setError(result.error.message);
  }

  return (
    <Card aria-labelledby="acc-org">
      <CardHead title={t('organization')} titleId="acc-org" icon="info" />
      {current && (
        <p className="text-ui">
          {t.rich('currentOrg', {
            name: current.name,
            role: tRole(current.role),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      )}
      {others.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {others.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ui">
                {o.name}
                <span className="text-fg-2"> · {tRole(o.role)}</span>
              </span>
              <Button
                variant="secondary"
                loading={pending === o.id}
                disabled={pending !== null}
                onClick={() => switchTo(o.id)}
              >
                {pending === o.id ? t('switching') : t('switchTo')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="mt-3">
          <Alert tone="error" role="alert" title={error} />
        </div>
      )}
    </Card>
  );
}

type Errors = { current?: string; password?: string; confirm?: string };

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const t = useTranslations('account');
  const tAuth = useTranslations('auth');
  const format = useFormat();
  const tAccept = useTranslations('accept');
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
    if (!current) found.current = t('currentPasswordRequired');
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
      toast.show({ message: t('changed') });
      return;
    }
    const { error } = result;
    if (error.status === 401 || error.code === 'INVALID_CREDENTIALS') {
      setErrors({ current: t('currentPasswordWrong') });
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
      setFormError(error.status === 429 ? tAuth('tooManyTries') : tAuth('busy'));
      return;
    }
    setFormError(error.message);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="max-w-auth">
      {formError ? (
        <Alert tone="error" role="alert" title={formError}>
          {waitSeconds > 0 ? tAuth('tryAgainIn', { wait: format.duration(waitSeconds) }) : null}
        </Alert>
      ) : null}
      <PasswordField
        ref={currentRef}
        label={t('currentPassword')}
        name="currentPassword"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={errors.current}
      />
      <PasswordField
        ref={passwordRef}
        label={tAccept('newPassword')}
        name="newPassword"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={t('minHint', { min: minLength })}
      />
      <PasswordField
        ref={confirmRef}
        label={t('confirmNew')}
        name="confirmPassword"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />
      <Button type="submit" variant="primary" loading={submitting} disabled={waitSeconds > 0}>
        {submitting ? tAuth('submitting') : t('submit')}
      </Button>
    </form>
  );
}
