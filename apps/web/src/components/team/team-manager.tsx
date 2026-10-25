'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type ApiResult, apiPatch, apiPost } from '@/components/api/client';
import { useReauth } from '@/components/auth/reauth-dialog';
import { faDate, faNumber, faRelativeDay } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { toLocalMobile } from '@/lib/phone';
import type { UserListItemDTO } from '@/modules/identity/contracts';
import { InviteForm, type InviteLink, InviteLinkPanel } from './invite-form';

export type TeamMember = UserListItemDTO & {
  /** Students in flow (active + paused) with this primary mentor; null for admins. */
  studentCount: number | null;
};

const roleLabel = { admin: 'مدیر', mentor: 'مشاور', student: 'هنرجو' } as const;
const statusLabel = { invited: 'دعوت‌شده', active: 'فعال', disabled: 'غیرفعال' } as const;

type Confirm =
  | { kind: 'disable' | 'enable'; user: TeamMember }
  | { kind: 'role'; user: TeamMember; to: 'admin' | 'mentor' };

function confirmText(c: Confirm, name: string): string {
  if (c.kind === 'role') {
    return `نقش ${name} به «${roleLabel[c.to]}» عوض شود؟ از همه‌ی دستگاه‌ها خارج می‌شود و باید دوباره وارد شود.${c.to === 'admin' ? ' مدیر همه‌ی هنرجوها و تنظیمات را می‌بیند.' : ''}`;
  }
  if (c.kind === 'disable') {
    return `${name} غیرفعال شود؟ از همه‌ی دستگاه‌ها خارج می‌شود و لینک‌های بازش باطل می‌شوند. هنرجوهایش سر جایشان می‌مانند.`;
  }
  return `${name} دوباره فعال شود؟ با رمز قبلی‌اش وارد می‌شود.`;
}

/**
 * «تیم» (M11 کاربران و دعوت مشاور; admin only): staff list with role, status, accepted invite
 * and how many students each mentor has; «مربی جدید» (one-time invite link), «لینک تازه» for
 * invited users, disable / enable with an in-page confirmation, and role change. Sensitive
 * requests go through `useReauth` (`403 REAUTH_REQUIRED`, SEC-S7).
 */
export function TeamManager({ members, viewerId }: { members: TeamMember[]; viewerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const reauth = useReauth();
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<InviteLink | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(c: Confirm) {
    setBusy(c.user.id);
    setError(null);
    let res: ApiResult<UserListItemDTO>;
    if (c.kind === 'role') {
      res = await reauth.run(() =>
        apiPatch<UserListItemDTO>(`/api/v1/users/${c.user.id}/role`, { role: c.to }),
      );
    } else {
      res = await reauth.run(() =>
        apiPatch<UserListItemDTO>(`/api/v1/users/${c.user.id}`, {
          status: c.kind === 'disable' ? 'disabled' : 'active',
          ifUpdatedAt: c.user.updatedAt,
        }),
      );
    }
    setBusy(null);
    setConfirm(null);
    if (res.ok) {
      toast.show({
        message:
          c.kind === 'role'
            ? `${c.user.displayName} حالا ${roleLabel[c.to]} است.`
            : c.kind === 'disable'
              ? `${c.user.displayName} غیرفعال شد و از همه‌ی دستگاه‌ها خارج شد.`
              : `${c.user.displayName} دوباره فعال شد.`,
      });
      router.refresh();
      return;
    }
    const { error: e } = res;
    if (e.code === 'REAUTH_REQUIRED') setError('بدون تأیید دوباره‌ی رمز، تغییری ثبت نشد.');
    // 409s carry a clear Persian message from the API: last admin, stale row, not accepted yet.
    else setError(e.message);
  }

  async function newLink(user: TeamMember) {
    setBusy(user.id);
    setError(null);
    const res = await apiPost<{ inviteUrl: string; expiresAt: string }>(
      `/api/v1/users/${user.id}/invite-link`,
    );
    setBusy(null);
    if (res.ok) {
      setLink({ displayName: user.displayName, ...res.data });
      return;
    }
    setError(
      res.error.status === 409
        ? `${user.displayName} قبلاً دعوت را پذیرفته و لینک لازم ندارد.`
        : res.error.message,
    );
  }

  const sorted = [...members].sort(
    (a, b) =>
      Number(a.status === 'disabled') - Number(b.status === 'disabled') ||
      a.displayName.localeCompare(b.displayName, 'fa'),
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-2">
          {`${faNumber(members.filter((m) => m.role === 'mentor' && m.status === 'active').length)} مشاور فعال · ${faNumber(members.filter((m) => m.status === 'invited').length)} دعوت در انتظار`}
        </p>
        <Button
          variant="primary"
          aria-haspopup="dialog"
          onClick={() => setInviting(true)}
          className="max-md:w-full"
        >
          <Icon name="plus" size={16} />
          مربی جدید
        </Button>
      </div>

      {error ? <Alert tone="error" role="alert" title={error} /> : null}

      {sorted.length ? (
        <ul aria-label="اعضای تیم" className="flex flex-col gap-3">
          {sorted.map((m) => {
            const me = m.id === viewerId;
            const pending = confirm?.user.id === m.id ? confirm : null;
            return (
              <li
                key={m.id}
                className="rounded-md border border-line bg-surface p-4 shadow-sm md:px-5"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar id={m.id} name={m.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <strong className="text-md font-bold">{m.displayName}</strong>
                      {me ? <span className="text-sm text-fg-3">(خودم)</span> : null}
                      <Tag variant={m.role === 'admin' ? 'gate' : 'neutral'}>
                        {roleLabel[m.role]}
                      </Tag>
                      <Tag
                        variant={
                          m.status === 'active'
                            ? 'neutral'
                            : m.status === 'invited'
                              ? 'outline'
                              : 'late'
                        }
                        icon={m.status === 'invited' ? 'clock' : null}
                      >
                        {statusLabel[m.status]}
                      </Tag>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
                      {m.phone ? (
                        <bdi dir="ltr" className="[unicode-bidi:isolate]">
                          {toLocalMobile(m.phone)}
                        </bdi>
                      ) : null}
                      {m.studentCount !== null ? (
                        <span>{`${faNumber(m.studentCount)} هنرجو`}</span>
                      ) : null}
                      {m.inviteAcceptedAt ? (
                        <span>{`دعوت پذیرفته شد: ${faDate(new Date(m.inviteAcceptedAt))}`}</span>
                      ) : m.status === 'invited' ? (
                        <span className="text-fg-3">هنوز دعوت را نپذیرفته</span>
                      ) : null}
                      {m.lastSeenAt ? (
                        <span className="text-fg-3">{`آخرین فعالیت: ${faRelativeDay(new Date(m.lastSeenAt))}`}</span>
                      ) : null}
                    </p>
                  </div>
                  {me ? null : (
                    <div className="flex flex-wrap items-center gap-2 max-md:w-full">
                      {m.status === 'invited' ? (
                        <Button
                          size="sm"
                          variant="soft"
                          loading={busy === m.id}
                          onClick={() => void newLink(m)}
                          aria-label={`لینک تازه برای ${m.displayName}`}
                        >
                          <Icon name="refresh" size={16} />
                          لینک تازه
                        </Button>
                      ) : null}
                      {m.status === 'active' ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setConfirm({
                                kind: 'role',
                                user: m,
                                to: m.role === 'admin' ? 'mentor' : 'admin',
                              })
                            }
                            aria-label={`${m.role === 'admin' ? 'مشاور کردن' : 'مدیر کردن'} ${m.displayName}`}
                          >
                            {m.role === 'admin' ? 'مشاور کن' : 'مدیر کن'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setConfirm({ kind: 'disable', user: m })}
                            aria-label={`غیرفعال کردن ${m.displayName}`}
                          >
                            غیرفعال کردن
                          </Button>
                        </>
                      ) : null}
                      {m.status === 'disabled' ? (
                        <Button
                          size="sm"
                          onClick={() => setConfirm({ kind: 'enable', user: m })}
                          aria-label={`فعال کردن دوباره‌ی ${m.displayName}`}
                        >
                          فعال کردن دوباره
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
                {pending ? (
                  <div
                    role="alertdialog"
                    aria-label="تأیید"
                    className="mt-3 rounded-md border border-h-yellow-bd bg-h-yellow-bg px-4 py-3 text-ui text-h-yellow-fg"
                  >
                    <p className="font-semibold">{confirmText(pending, m.displayName)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setConfirm(null)}>
                        انصراف
                      </Button>
                      <Button
                        size="sm"
                        variant={pending.kind === 'disable' ? 'danger-solid' : 'primary'}
                        loading={busy === m.id}
                        onClick={() => void act(pending)}
                      >
                        {pending.kind === 'disable'
                          ? 'بله، غیرفعال کن'
                          : pending.kind === 'enable'
                            ? 'بله، فعال کن'
                            : 'بله، عوض کن'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon="users" tone="brand" title="هنوز مشاوری نداری" headingLevel={2}>
          با «مربی جدید» اولین مشاور را دعوت کن و لینکش را در تلگرام بفرست.
        </EmptyState>
      )}

      <Dialog
        open={inviting || link !== null}
        onClose={() => {
          setInviting(false);
          if (link) {
            setLink(null);
            router.refresh();
          }
        }}
        title={link ? `لینک دعوت ${link.displayName} آماده است` : 'مربی جدید'}
      >
        {link ? (
          <InviteLinkPanel
            link={link}
            onDone={() => {
              setLink(null);
              setInviting(false);
              router.refresh();
            }}
          />
        ) : inviting ? (
          <InviteForm
            onCancel={() => setInviting(false)}
            onCreated={(l) => {
              setInviting(false);
              setLink(l);
            }}
          />
        ) : null}
      </Dialog>
      {reauth.dialog}
    </>
  );
}
