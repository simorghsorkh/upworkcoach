'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { apiPost } from '@/components/api/client';
import { useFormat } from '@/components/format/use-format';
import { Tag, type TagVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { TextareaField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { BookingDTO } from '@/modules/scheduling/contracts';

const STATUS_TAG: Record<BookingDTO['status'], TagVariant> = {
  pending: 'new',
  approved: 'gate',
  declined: 'neutral',
  cancelled: 'neutral',
  expired: 'outline',
};

/**
 * Booking requests (Coach Office sprint 7): staff approve or decline, a mentee cancels.
 * Each row shows what the caller may do (`can`); the slot itself is re-checked server side.
 */
export function BookingList({
  initial,
  view,
  empty,
}: {
  initial: BookingDTO[];
  view: 'staff' | 'mentee';
  empty: string;
}) {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');
  const format = useFormat();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<BookingDTO | null>(null);
  const [reason, setReason] = useState('');

  async function act(b: BookingDTO, action: 'approve' | 'decline' | 'cancel', body?: unknown) {
    setBusy(b.id);
    setError(null);
    const result = await apiPost<BookingDTO>(`/api/v1/booking-requests/${b.id}/${action}`, body);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setItems((list) => list.map((x) => (x.id === b.id ? result.data : x)));
    const done = { approve: 'approved', decline: 'declined', cancel: 'cancelled' } as const;
    toast.show({ message: t(`calendar.toast.${done[action]}`) });
    router.refresh();
    return true;
  }

  if (!items.length) return <p className="text-sm text-fg-3">{empty}</p>;

  return (
    <>
      {error ? (
        <Alert tone="error" role="alert" className="mb-2">
          {error}
        </Alert>
      ) : null}
      <ul className="-mx-4 md:-mx-5">
        {items.map((b) => {
          const at = new Date(b.scheduledAt);
          return (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 first:border-t-0 md:px-5"
            >
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{format.dayTime(at)}</span>
                  <Tag variant={STATUS_TAG[b.status]} icon={null}>
                    {t(`booking.status.${b.status}`)}
                  </Tag>
                  {view === 'staff' && !b.hasPackage && b.status === 'pending' ? (
                    <Tag variant="late" icon="alert">
                      {t('booking.noPackage')}
                    </Tag>
                  ) : null}
                </p>
                <p className="text-sm text-fg-2">
                  <bdi>{b.template.title}</bdi>
                  {' · '}
                  {t('booking.with', {
                    name: view === 'staff' ? b.student.displayName : b.mentor.displayName,
                  })}
                  {' · '}
                  {t('calendar.minutes', { count: b.durationMinutes })}
                </p>
                {b.note ? (
                  <p className="mt-1 text-sm text-fg-2">
                    <span className="text-fg-3">{t('booking.note')}: </span>
                    <bdi>{b.note}</bdi>
                  </p>
                ) : null}
                {view === 'staff' && !b.hasPackage && b.status === 'pending' ? (
                  <p className="mt-1 text-xs text-h-red-fg">{t('booking.noPackageHint')}</p>
                ) : null}
                {b.status === 'pending' ? (
                  <p className="mt-1 text-xs text-fg-3">
                    {t('booking.holdUntil', { at: format.dayTime(new Date(b.holdUntil)) })}
                  </p>
                ) : null}
                {b.status === 'declined' && b.declineReason ? (
                  <p className="mt-1 text-sm text-fg-2">
                    {t('booking.declinedBecause', { reason: b.declineReason })}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {b.can.approve ? (
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={busy === b.id}
                    onClick={() => act(b, 'approve')}
                  >
                    {t('booking.approve')}
                  </Button>
                ) : null}
                {b.can.decline ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === b.id}
                    onClick={() => {
                      setReason('');
                      setDeclining(b);
                    }}
                  >
                    {t('booking.decline')}
                  </Button>
                ) : null}
                {b.can.cancel ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy === b.id}
                    onClick={() => act(b, 'cancel')}
                  >
                    {t('booking.cancel')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title={t('booking.declineTitle')}
        description={t('booking.declineBody')}
        footer={
          <DialogActions>
            <Button variant="ghost" onClick={() => setDeclining(null)}>
              {tc('cancel')}
            </Button>
            <Button
              variant="danger-solid"
              disabled={busy !== null}
              onClick={async () => {
                if (!declining) return;
                const ok = await act(
                  declining,
                  'decline',
                  reason.trim() ? { reason: reason.trim() } : {},
                );
                if (ok) setDeclining(null);
              }}
            >
              {t('booking.decline')}
            </Button>
          </DialogActions>
        }
      >
        <TextareaField
          label={t('booking.reason')}
          optional
          rows={3}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Dialog>
    </>
  );
}
