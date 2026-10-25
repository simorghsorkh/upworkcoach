'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { faDayTime, faNumber, tehranDaysBetween } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { MenuButton } from '@/components/ui/choice';
import { cn } from '@/components/ui/cn';
import { useToast } from '@/components/ui/toast';
import type { ReminderDTO } from '@/modules/reminders/contracts';

const UNDO_SECONDS = 10;

/**
 * «انجام شد» is sent after the undo window (user-flows §6: «برگرداندن» تا ۱۰ ثانیه), because
 * the API has no «undo done». Pending ones are flushed with `keepalive` if the tab closes.
 */
const pending = new Map<string, ReturnType<typeof setTimeout>>();

function sendDone(id: string, keepalive = false) {
  pending.delete(id);
  if (keepalive) {
    void fetch(`/api/v1/reminders/${id}/done`, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { Accept: 'application/json' },
    });
    return Promise.resolve(true);
  }
  return apiPost(`/api/v1/reminders/${id}/done`).then((r) => r.ok);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const [id, t] of pending) {
      clearTimeout(t);
      void sendDone(id, true);
    }
  });
}

/** «از دیروز»، «۲ روز گذشته» for overdue reminders. */
function lateLabel(dueAt: Date, now: Date): string {
  const days = tehranDaysBetween(dueAt, now);
  if (days <= 0) return 'از امروز';
  if (days === 1) return 'از دیروز';
  return `${faNumber(days)} روز گذشته`;
}

/**
 * Reminder rows (mockups/today.html #reminders): student and text link to the record, late
 * ones get a red start line and «از دیروز», «انجام شد» (with undo) and «تعویق» 1 day / 3 days
 * / 1 week (`POST /reminders/:id/snooze`).
 */
export function ReminderList({
  reminders,
  viewerId,
  showOwner,
  emptyText = 'یادآوری برای امروز نداری.',
  readOnly,
  compact,
}: {
  reminders: ReminderDTO[];
  viewerId: string;
  showOwner?: boolean;
  emptyText?: string;
  /** Done list: no actions. */
  readOnly?: boolean;
  /** Narrow column (record sidebar): actions go under the text at every size. */
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();

  // Server data changed (refresh): forget local hides that are no longer pending.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `reminders` is the trigger
  useEffect(() => {
    setHidden((h) => new Set([...h].filter((id) => pending.has(id))));
  }, [reminders]);

  function done(r: ReminderDTO) {
    setError(null);
    setHidden((h) => new Set(h).add(r.id));
    const timer = setTimeout(async () => {
      const ok = await sendDone(r.id);
      if (!ok) {
        setHidden((h) => {
          const n = new Set(h);
          n.delete(r.id);
          return n;
        });
        setError('«انجام شد» ثبت نشد؛ دوباره بزن.');
      } else router.refresh();
    }, UNDO_SECONDS * 1000);
    pending.set(r.id, timer);
    toast.show({
      message: `«${r.text}» انجام شد.`,
      seconds: UNDO_SECONDS,
      onUndo: () => {
        clearTimeout(timer);
        pending.delete(r.id);
        setHidden((h) => {
          const n = new Set(h);
          n.delete(r.id);
          return n;
        });
      },
    });
  }

  async function snooze(r: ReminderDTO, days: number) {
    setBusy(r.id);
    setError(null);
    const res = await apiPost<ReminderDTO>(`/api/v1/reminders/${r.id}/snooze`, { days });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show({ message: `یادآور به ${faDayTime(new Date(res.data.dueAt), now)} رفت.` });
    router.refresh();
  }

  const visible = reminders.filter((r) => !hidden.has(r.id));

  return (
    <>
      {error ? (
        <p role="alert" className="mb-2 text-sm font-semibold text-h-red-fg">
          {error}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-3">{emptyText}</p>
      ) : (
        <ul className="-mx-4 md:-mx-5">
          {visible.map((r) => {
            const due = new Date(r.dueAt);
            const late = r.overdue && tehranDaysBetween(due, now) > 0;
            const href = r.student ? `/students/${r.student.id}` : null;
            return (
              <li
                key={r.id}
                className={cn(
                  'relative flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover md:px-5',
                  compact ? 'flex-wrap' : 'max-md:flex-wrap',
                  late &&
                    'before:absolute before:start-0 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px] before:bg-h-red-fg',
                )}
              >
                {r.student ? (
                  <Avatar id={r.student.id} name={r.student.displayName} className="mt-0.5" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-8 flex-none place-items-center rounded-full bg-surface-3 text-fg-3"
                  >
                    <Icon name="bell" size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {href ? (
                    <Link
                      href={href}
                      className="block leading-6 font-semibold text-fg hover:text-link"
                    >
                      <bdi>{r.text}</bdi>
                    </Link>
                  ) : (
                    <span className="block leading-6 font-semibold">
                      <bdi>{r.text}</bdi>
                    </span>
                  )}
                  <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-fg-2">
                    {r.student ? (
                      <span className="font-semibold text-fg">{r.student.displayName}</span>
                    ) : null}
                    {readOnly ? (
                      <span>{`انجام شد ${r.doneAt ? faDayTime(new Date(r.doneAt), now) : ''}`}</span>
                    ) : late ? (
                      <Tag variant="late">{lateLabel(due, now)}</Tag>
                    ) : (
                      <span>{faDayTime(due, now)}</span>
                    )}
                    {r.snoozeCount ? (
                      <span className="text-fg-3">{`${faNumber(r.snoozeCount)} بار تعویق`}</span>
                    ) : null}
                    {r.source === 'system' ? <Tag variant="outline">خودکار</Tag> : null}
                    {showOwner ? (
                      <span>{`مشاور: ${r.owner.id === viewerId ? 'خودم' : r.owner.displayName}`}</span>
                    ) : null}
                  </div>
                </div>
                {readOnly ? null : (
                  <div
                    className={cn(
                      'flex flex-none items-center gap-1.5',
                      compact ? 'w-full ps-11' : 'max-md:w-full max-md:ps-11',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => done(r)}
                      className={buttonClass({ size: 'sm' })}
                      aria-label={`انجام شد: ${r.text}`}
                    >
                      <Icon name="check" size={14} />
                      انجام شد
                    </button>
                    <MenuButton
                      label={
                        <>
                          تعویق
                          <Icon name="chev-down" size={14} />
                        </>
                      }
                      title="تعویق تا…"
                      buttonClassName={buttonClass({
                        size: 'sm',
                        variant: 'ghost',
                        className: busy === r.id ? 'opacity-55' : '',
                      })}
                      items={[
                        { label: '۱ روز', onSelect: () => void snooze(r, 1) },
                        { label: '۳ روز', onSelect: () => void snooze(r, 3) },
                        { label: '۱ هفته', onSelect: () => void snooze(r, 7) },
                      ]}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
