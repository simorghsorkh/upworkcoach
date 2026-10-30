'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { AttachmentThumbs } from '@/components/files/image-uploads';
import { faNumber } from '@/components/format/fa';
import { formatJalaliLong } from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { TextareaField } from '@/components/ui/field';
import { Alert, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { MilestoneTypeDTO } from '@/modules/catalog/contracts';
import type { MilestoneDTO } from '@/modules/milestones/contracts';
import { MilestoneForm } from './milestone-form';

export function moneyText(amount: string | null, currency: string | null): string | null {
  if (!amount) return null;
  const n = Number(amount);
  const value = Number.isFinite(n)
    ? new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(n)
    : amount;
  return currency === 'USD' || !currency ? `${value} دلار` : `${value} ${currency}`;
}

/**
 * M3e "Milestones" (mockups/student-profile.html #milestones): approved ones with who approved,
 * student proposals with "Approve" / "Reject" (reason required), and "Record" for staff (approved at
 * once). Only approved milestones count for the North Star (F9).
 */
export function StaffMilestones({
  studentId,
  firstName,
  items,
  types,
  platforms,
  viewerId,
  openForm,
  onFormClose,
}: {
  studentId: string;
  firstName: string;
  items: MilestoneDTO[];
  types: MilestoneTypeDTO[];
  platforms: Array<{ id: string; name: string }>;
  viewerId: string;
  /** Controlled "Record" dialog (the record's "More" menu opens it too). */
  openForm?: boolean;
  onFormClose?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [rejecting, setRejecting] = useState<MilestoneDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = formOpen || Boolean(openForm);
  const close = () => {
    setFormOpen(false);
    onFormClose?.();
  };

  async function approve(m: MilestoneDTO) {
    setBusy(m.id);
    setError(null);
    const res = await apiPost(`/api/v1/milestones/${m.id}/approve`);
    setBusy(null);
    if (res.ok) {
      toast.show({ message: `«${m.type.name}» تأیید شد.` });
      router.refresh();
      return;
    }
    setError(
      res.error.status === 409
        ? 'این مورد قبلاً تصمیم گرفته شده یا این نوع برای این هنرجو قبلاً تأیید شده است.'
        : res.error.message,
    );
  }

  const visible = items.filter((m) => m.status !== 'rejected');
  const rejected = items.filter((m) => m.status === 'rejected');

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="h-ms" className="flex items-center gap-2 text-h2">
          <Icon name="award" className="text-fg-3" />
          نقاط عطف
        </h2>
        <Button size="sm" variant="ghost" aria-haspopup="dialog" onClick={() => setFormOpen(true)}>
          <Icon name="plus" size={16} />
          ثبت
        </Button>
      </div>
      {error ? <Alert tone="error" role="alert" title={error} /> : null}
      {visible.length ? (
        <ul className="-mx-4 md:-mx-5">
          {visible.map((m) => (
            <li
              key={m.id}
              className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 md:px-5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 grid size-7 flex-none place-items-center rounded-full',
                  m.status === 'approved'
                    ? 'bg-h-green-bg text-h-green-fg'
                    : 'bg-primary-weak-2 text-primary-text',
                )}
              >
                <Icon name={m.status === 'approved' ? 'check' : 'flag'} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg">
                  {m.type.name}
                  {m.type.countsForNorthStar ? (
                    <span className="ms-2 text-xs font-medium text-fg-3">شاخص اصلی</span>
                  ) : null}
                </p>
                <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
                  {m.status === 'proposed' ? <Tag variant="new">پیشنهاد هنرجو</Tag> : null}
                  <span>{formatJalaliLong(m.occurredOn)}</span>
                  {m.platform ? <bdi>{m.platform.name}</bdi> : null}
                  {moneyText(m.amount, m.currency) ? (
                    <span>{moneyText(m.amount, m.currency)}</span>
                  ) : null}
                  {m.status === 'approved' && m.decidedBy ? (
                    <span>{`تأیید: ${m.decidedBy.id === viewerId ? 'خودم' : m.decidedBy.displayName}`}</span>
                  ) : null}
                  {m.attachments.length ? (
                    <span>{`${faNumber(m.attachments.length)} تصویر`}</span>
                  ) : null}
                </div>
                {m.evidenceText ? (
                  <p
                    dir="auto"
                    className="mt-1.5 rounded-sm bg-bg px-3 py-2 text-sm whitespace-pre-line text-fg-2"
                  >
                    {m.evidenceText}
                  </p>
                ) : null}
                <AttachmentThumbs items={m.attachments} />
                {m.status === 'proposed' ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="soft"
                      loading={busy === m.id}
                      onClick={() => void approve(m)}
                      aria-label={`تأیید ${m.type.name}`}
                    >
                      <Icon name="check" size={16} />
                      تأیید
                    </Button>
                    <Button
                      size="sm"
                      aria-haspopup="dialog"
                      onClick={() => setRejecting(m)}
                      aria-label={`رد ${m.type.name}`}
                    >
                      رد
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="award" tone="brand" title="هنوز نقطه‌ی عطفی نیست" className="py-5">
          {`اولین اپلای، اولین مصاحبه و اولین قرارداد ${firstName} این‌جا ثبت می‌شود.`}
        </EmptyState>
      )}
      {rejected.length ? (
        <p className="mt-2 text-xs text-fg-3">{`${faNumber(rejected.length)} پیشنهاد ردشده`}</p>
      ) : null}

      <Dialog open={open} onClose={close} title={`نقطه‌ی عطف برای ${firstName}`}>
        <MilestoneForm
          mode="staff"
          studentId={studentId}
          types={types}
          platforms={platforms}
          onCancel={close}
          onDone={() => {
            close();
            toast.show({ message: 'نقطه‌ی عطف ثبت شد.' });
            router.refresh();
          }}
        />
      </Dialog>
      <RejectDialog
        milestone={rejecting}
        onClose={() => setRejecting(null)}
        onDone={() => {
          setRejecting(null);
          toast.show({ message: 'پیشنهاد رد شد.' });
          router.refresh();
        }}
      />
    </>
  );
}

function RejectDialog({
  milestone,
  onClose,
  onDone,
}: {
  milestone: MilestoneDTO | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!milestone || sending) return;
    if (!reason.trim()) {
      setError('دلیل رد را بنویس.');
      return;
    }
    setSending(true);
    const res = await apiPost(`/api/v1/milestones/${milestone.id}/reject`, {
      reason: reason.trim(),
    });
    setSending(false);
    if (res.ok) {
      setReason('');
      onDone();
      return;
    }
    setError(res.error.fields.reason ?? res.error.message);
  }

  return (
    <Dialog
      open={milestone !== null}
      onClose={onClose}
      title={milestone ? `رد «${milestone.type.name}»` : 'رد'}
      description="هنرجو ردشده‌ها را نمی‌بیند؛ بهتر است دلیل را در یک یادداشت اشتراکی هم بگویی."
    >
      <form noValidate onSubmit={onSubmit}>
        <TextareaField
          label="دلیل"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={error}
          className="min-h-[76px]"
        />
        <DialogActions>
          <Button onClick={onClose}>انصراف</Button>
          <Button type="submit" variant="danger" loading={sending}>
            رد پیشنهاد
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
