'use client';

import { type FormEvent, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { cleanPhoneInput, phoneError } from '@/components/auth/phone';
import { useReauth } from '@/components/auth/reauth-dialog';
import { faDate, faNumber, tehranDaysBetween } from '@/components/format/fa';
import { copyText } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { RadioCards } from '@/components/ui/choice';
import { cn } from '@/components/ui/cn';
import { DialogActions } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';

export type StaffRole = 'mentor' | 'admin';
export type InviteLink = { displayName: string; inviteUrl: string; expiresAt: string };

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function staffInviteMessage(name: string, url: string, days: number): string {
  return `سلام ${firstName(name)}، این لینک ورود تو به دفتر مربی UpworkCoach است. یک رمز بگذار و وارد شو: ${url} (تا ${faNumber(days)} روز معتبر)`;
}

/**
 * "New mentor" (M11 users and mentor invites): name, mobile (Persian digits accepted) and role.
 * `POST /api/v1/invitations` behind the SEC-S7 password check (`REAUTH_REQUIRED` → dialog,
 * then the same request again). The invite link is shown only once, by the caller.
 */
export function InviteForm({
  onCreated,
  onCancel,
}: {
  onCreated: (link: InviteLink) => void;
  onCancel: () => void;
}) {
  const reauth = useReauth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('mentor');
  const [errors, setErrors] = useState<{ displayName?: string; phone?: string; form?: string }>({});
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const next: typeof errors = {};
    if (!name.trim()) next.displayName = 'نام را بنویس.';
    const pe = phoneError(phone);
    if (pe) next.phone = pe.replace('موبایلت', 'موبایل');
    setErrors(next);
    if (Object.keys(next).length) return;
    setSending(true);
    const body = { role, displayName: name.trim(), phone: cleanPhoneInput(phone) };
    const res = await reauth.run(() =>
      apiPost<{ userId: string; inviteUrl: string; expiresAt: string }>(
        '/api/v1/invitations',
        body,
      ),
    );
    setSending(false);
    if (res.ok) {
      onCreated({
        displayName: body.displayName,
        inviteUrl: res.data.inviteUrl,
        expiresAt: res.data.expiresAt,
      });
      return;
    }
    const { error } = res;
    if (error.code === 'PHONE_TAKEN' || (error.status === 409 && !error.fields.displayName)) {
      setErrors({ phone: 'این شماره قبلاً برای کاربر دیگری ثبت شده است.' });
    } else if (error.code === 'REAUTH_REQUIRED') {
      setErrors({ form: 'بدون تأیید دوباره‌ی رمز، دعوت ساخته نمی‌شود.' });
    } else if (error.fields.displayName || error.fields.phone) {
      setErrors({ displayName: error.fields.displayName, phone: error.fields.phone });
    } else {
      setErrors({ form: error.message });
    }
  }

  return (
    <>
      <form noValidate onSubmit={onSubmit} aria-label="دعوت عضو تازه‌ی تیم">
        {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
        <TextField
          label="نام"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.displayName}
          autoComplete="off"
          maxLength={80}
        />
        <TextField
          label="شماره‌ی موبایل"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          inputMode="tel"
          dir="ltr"
          placeholder="۰۹۱۲۳۴۵۶۷۸۹"
          autoComplete="off"
        />
        <RadioCards
          legend="نقش"
          value={role}
          onChange={setRole}
          options={[
            { value: 'mentor', label: 'مشاور' },
            { value: 'admin', label: 'مدیر' },
          ]}
          hint={
            role === 'mentor' ? 'مشاور فقط هنرجوهایی را می‌بیند که به او سپرده شده‌اند.' : undefined
          }
        />
        {role === 'admin' ? (
          <Alert tone="warn" title="مدیر همه‌چیز را می‌بیند و تغییر می‌دهد:">
            همه‌ی هنرجوها، تنظیمات، خروجی‌ها و دعوت دیگران. فقط به کسی بده که کاملاً به او اعتماد داری.
          </Alert>
        ) : null}
        <DialogActions>
          <Button onClick={onCancel}>انصراف</Button>
          <Button type="submit" variant="primary" loading={sending}>
            <Icon name="link" size={16} />
            ساخت لینک دعوت
          </Button>
        </DialogActions>
      </form>
      {reauth.dialog}
    </>
  );
}

/** The one-time link (C1: token in the `#` fragment), with copy and the Telegram message. */
export function InviteLinkPanel({ link, onDone }: { link: InviteLink; onDone: () => void }) {
  const [copied, setCopied] = useState<'link' | 'message' | 'failed' | null>(null);
  const expires = new Date(link.expiresAt);
  const days = Math.max(1, tehranDaysBetween(new Date(), expires));
  const message = staffInviteMessage(link.displayName, link.inviteUrl, days);
  async function copy(kind: 'link' | 'message') {
    const ok = await copyText(kind === 'link' ? link.inviteUrl : message);
    setCopied(ok ? kind : 'failed');
  }
  return (
    <div>
      <Alert tone="warn" title="این لینک فقط همین یک بار نمایش داده می‌شود.">
        {`یک‌بارمصرف است و تا ${faDate(expires)} (${faNumber(days)} روز) کار می‌کند. همین حالا کپی کن و خودت برایش بفرست.`}
      </Alert>
      <div className="flex items-center gap-2 rounded-sm border border-line-2 bg-bg py-1.5 ps-3 pe-1.5">
        <Icon name="link" size={16} className="text-fg-3" />
        <code
          dir="ltr"
          className="min-w-0 flex-1 truncate text-start font-sans text-ui [unicode-bidi:isolate]"
          data-testid="invite-url"
        >
          {link.inviteUrl}
        </code>
        <Button size="sm" onClick={() => void copy('link')}>
          <Icon name="copy" size={16} />
          کپی
        </Button>
      </div>
      <p className="mt-5 mb-1.5 text-xs font-semibold text-fg-3">متن آماده برای تلگرام</p>
      <div className="rounded-[14px] rounded-es-[4px] bg-surface-2 px-4 py-3 text-ui leading-6 [overflow-wrap:anywhere]">
        {message}
      </div>
      <p
        role="status"
        className={cn(
          'mt-2 min-h-5 text-sm font-semibold',
          copied === 'failed' ? 'text-h-red-fg' : 'text-h-green-fg',
        )}
      >
        {copied === 'link'
          ? 'لینک کپی شد.'
          : copied === 'message'
            ? 'متن و لینک کپی شد.'
            : copied === 'failed'
              ? 'کپی نشد؛ لینک را انتخاب کن و دستی کپی کن.'
              : ''}
      </p>
      <DialogActions>
        <Button onClick={onDone}>تمام شد</Button>
        <Button variant="primary" onClick={() => void copy('message')}>
          <Icon name="copy" size={16} />
          کپی متن و لینک
        </Button>
      </DialogActions>
    </div>
  );
}
