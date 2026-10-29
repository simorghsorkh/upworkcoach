'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { apiPut } from '@/components/api/client';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/states';
import type { ProgressDTO } from '@/modules/programs/contracts';

/**
 * The mentee's own mark on a lesson, resource or checklist of their program (Coach Office
 * sprint 5): a done / undo button, or one checkbox per checklist item. Each change goes to
 * PUT /enrollments/:id/nodes/:nodeId/completion and refreshes the page for the new progress.
 */
export function ActivityMark({
  enrollmentId,
  nodeId,
  done: initialDone,
  items,
  checklistState,
}: {
  enrollmentId: string;
  nodeId: string;
  done: boolean;
  /** Checklist items; empty for a lesson or resource (and a checklist without items). */
  items: string[];
  checklistState: boolean[];
}) {
  const t = useTranslations('programs.my');
  const router = useRouter();
  const [done, setDone] = useState(initialDone);
  const [ticks, setTicks] = useState(() => items.map((_, i) => checklistState[i] === true));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/v1/enrollments/${enrollmentId}/nodes/${nodeId}/completion`;

  async function send(body: { done?: boolean; checklist?: boolean[] }): Promise<boolean> {
    setBusy(true);
    setError(null);
    const result = await apiPut<ProgressDTO>(url, body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function toggle() {
    if (await send({ done: !done })) setDone(!done);
  }

  async function tick(index: number, value: boolean) {
    const next = ticks.map((v, i) => (i === index ? value : v));
    setTicks(next);
    if (!(await send({ checklist: next }))) setTicks(ticks);
  }

  if (items.length) {
    return (
      <div className="mt-2">
        <ul aria-label={t('items')} className="flex flex-col gap-1">
          {items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: items keep their position (ticks follow it)
            <li key={i}>
              <label className="inline-flex min-h-tap cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={ticks[i] ?? false}
                  disabled={busy}
                  onChange={(event) => tick(i, event.target.checked)}
                />
                <bdi className={ticks[i] ? 'text-fg-3 line-through' : 'text-fg'}>{item}</bdi>
              </label>
            </li>
          ))}
        </ul>
        {error ? (
          <Alert tone="error" className="mt-2">
            {error}
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" variant={done ? 'ghost' : 'soft'} loading={busy} onClick={toggle}>
        {done ? null : <Icon name="check" size={14} />}
        {done ? t('undo') : t('markDone')}
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
