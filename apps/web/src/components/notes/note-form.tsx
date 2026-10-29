'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { addDaysTo, todayDay } from '@/components/format/jalali';
import { Icon } from '@/components/icons/icon';
import { COMPOSER_KINDS, noteKindLabel, SESSION_TEMPLATE } from '@/components/tasks/labels';
import { Button } from '@/components/ui/button';
import { ChipButton, RadioCards } from '@/components/ui/choice';
import { cn } from '@/components/ui/cn';
import { DialogActions } from '@/components/ui/dialog';
import { TextareaField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { CreateReminderInput, ReminderDTO } from '@/modules/reminders/contracts';
import type {
  CreateNoteInput,
  NoteDTO,
  NoteKind,
  NoteVisibility,
} from '@/modules/timeline/contracts';

const KIND_KEY = 'uc:note-kind';
const draftKey = (studentId: string) => `uc:note-draft:${studentId}`;

type Draft = { body: string; kind: NoteKind; visibility: NoteVisibility };

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readDraft(studentId: string): Draft | null {
  try {
    const raw = storage()?.getItem(draftKey(studentId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function lastKind(): NoteKind {
  const k = storage()?.getItem(KIND_KEY) as NoteKind | null;
  return k && (COMPOSER_KINDS as readonly string[]).includes(k) ? k : 'note';
}

export type FollowUp = { kind: 'reminder'; days: number } | { kind: 'task' } | null;

/**
 * Quick note (F5, user-flows §5, mockups/student-profile.html `.composer` and `#note`):
 * kind (default: last used), text (a short template for «جلسه»), who sees it (internal by
 * default; shared shows «هنرجو این را می‌بیند», SEC-F6) and an optional next step. The text
 * is kept on this device until it is saved, so a dropped connection never loses it.
 * `POST /students/:id/notes` (+ `POST /reminders` for the follow-up).
 */
export function NoteForm({
  student,
  variant,
  onSaved,
  onCancel,
  onCreateTask,
  autoFocus,
}: {
  student: { id: string; displayName: string };
  /** `inline`: the always-open composer above the timeline; `sheet`: the bottom sheet. */
  variant: 'inline' | 'sheet';
  onSaved?: (note: NoteDTO) => void;
  onCancel?: () => void;
  /** «+ کار از این یادداشت»: opens the task form with a suggested title. */
  onCreateTask?: (suggestedTitle: string, body: string) => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const textId = useId();
  const firstName = student.displayName.trim().split(/\s+/)[0] ?? student.displayName;
  const [kind, setKind] = useState<NoteKind>('note');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibility>('internal');
  const t = useTranslations('notes');
  const [followUp, setFollowUp] = useState<FollowUp>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const d = readDraft(student.id);
    if (d?.body) {
      setBody(d.body);
      setKind(d.kind);
      setVisibility(d.visibility);
    } else {
      const k = lastKind();
      setKind(k);
      if (k === 'session') setBody(SESSION_TEMPLATE);
    }
    loaded.current = true;
  }, [student.id]);

  useEffect(() => {
    if (!loaded.current) return;
    const s = storage();
    if (!s) return;
    try {
      if (body.trim() && body !== SESSION_TEMPLATE) {
        s.setItem(draftKey(student.id), JSON.stringify({ body, kind, visibility } satisfies Draft));
      } else s.removeItem(draftKey(student.id));
    } catch {
      // ignore quota errors
    }
  }, [body, kind, visibility, student.id]);

  function changeKind(next: NoteKind) {
    setKind(next);
    // The session template only fills an empty box, and leaves with the kind.
    if (next === 'session' && !body.trim()) setBody(SESSION_TEMPLATE);
    else if (next !== 'session' && body === SESSION_TEMPLATE) setBody('');
  }

  async function onSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (submitting) return;
    const text = body.trim();
    if (!text || body === SESSION_TEMPLATE) {
      setError('متن یادداشت را بنویس.');
      return;
    }
    setError(null);
    setFailed(null);
    setSubmitting(true);
    const input: CreateNoteInput = { body: text, kind, visibility };
    const res = await apiPost<NoteDTO>(`/api/v1/students/${student.id}/notes`, input);
    if (!res.ok) {
      setSubmitting(false);
      if (res.error.fields.body) setError(res.error.fields.body);
      else if (res.error.status === 0 || res.error.status >= 500)
        setFailed('ذخیره نشد؛ دوباره تلاش کن. متنت روی همین دستگاه نگه داشته شده است.');
      else setFailed(res.error.message);
      return;
    }
    try {
      storage()?.removeItem(draftKey(student.id));
      storage()?.setItem(KIND_KEY, kind);
    } catch {
      // ignore
    }
    let extra = '';
    if (followUp?.kind === 'reminder') {
      const reminder: CreateReminderInput = {
        text: `پیگیری ${firstName}: ${text.split('\n')[0]?.slice(0, 120) ?? ''}`.trim(),
        dueDate: addDaysTo(todayDay(), followUp.days),
        studentId: student.id,
      };
      const r = await apiPost<ReminderDTO>('/api/v1/reminders', reminder);
      extra = r.ok ? ' یادآور هم گذاشته شد.' : ' یادآور ثبت نشد؛ از «یادآور» دوباره بگذار.';
    }
    setSubmitting(false);
    toast.show({
      message:
        (visibility === 'shared'
          ? `یادداشت ثبت شد؛ ${firstName} آن را می‌بیند.`
          : visibility === 'private'
            ? t('savedPrivate')
            : 'یادداشت داخلی ثبت شد.') + extra,
    });
    // Clear only what was sent: text typed while the save was in flight stays.
    setBody((current) => (current === body ? '' : current));
    setFollowUp(null);
    setVisibility((current) => (current === visibility ? 'internal' : current));
    onSaved?.(res.data);
    if (followUp?.kind === 'task') onCreateTask?.(text.split('\n')[0]?.slice(0, 120) ?? '', text);
    router.refresh();
  }

  const visibilityOptions = [
    {
      value: 'internal' as const,
      label: variant === 'inline' ? 'داخلی' : 'داخلی — فقط تیم',
      icon: 'lock' as const,
    },
    {
      value: 'shared' as const,
      label: variant === 'inline' ? 'اشتراکی' : `اشتراکی — ${firstName} هم می‌بیند`,
      icon: 'eye' as const,
    },
    {
      value: 'private' as const,
      label: variant === 'inline' ? t('privateShort') : t('privateLong'),
      icon: 'user' as const,
    },
  ];

  const status = (
    <>
      {failed ? (
        <Alert
          tone="error"
          role="alert"
          title={failed}
          action={
            <Button size="sm" onClick={() => void onSubmit()}>
              <Icon name="refresh" size={14} />
              تلاش دوباره
            </Button>
          }
        />
      ) : null}
    </>
  );

  if (variant === 'inline') {
    return (
      <form noValidate onSubmit={onSubmit} aria-label="یادداشت تازه">
        {status}
        <div
          className={cn(
            'rounded-md border bg-surface transition-[border-color,box-shadow] focus-within:border-focus focus-within:shadow-ring',
            error ? 'border-h-red-fg' : 'border-line-2',
          )}
        >
          <label htmlFor={textId} className="sr-only">
            متن یادداشت
          </label>
          <textarea
            id={textId}
            dir="auto"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void onSubmit();
            }}
            placeholder={`یادداشت تازه درباره‌ی ${firstName}…`}
            aria-invalid={error ? true : undefined}
            className="block min-h-[76px] w-full resize-y rounded-t-md bg-transparent px-4 py-3 text-md text-fg placeholder:text-fg-3 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 rounded-b-md border-t border-line bg-bg px-3 py-2">
            <label className="sr-only" htmlFor={`${textId}-kind`}>
              نوع
            </label>
            <select
              id={`${textId}-kind`}
              value={kind}
              onChange={(e) => changeKind(e.target.value as NoteKind)}
              className="min-h-8 cursor-pointer rounded-btn-sm border border-line-2 bg-surface px-2 text-sm"
            >
              {COMPOSER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {noteKindLabel[k]}
                </option>
              ))}
            </select>
            <VisibilitySwitch
              value={visibility}
              onChange={setVisibility}
              options={visibilityOptions}
            />
            <span className="flex-1" />
            {visibility === 'shared' ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-primary-text">
                <Icon name="eye" size={14} />
                هنرجو این را می‌بیند
              </span>
            ) : null}
            <Button type="submit" variant="soft" size="sm" loading={submitting}>
              ثبت یادداشت
            </Button>
          </div>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-h-red-fg"
          >
            <Icon name="alert" size={16} />
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label={`یادداشت برای ${student.displayName}`}>
      {status}
      <RadioCards
        legend="نوع"
        options={COMPOSER_KINDS.map((k) => ({ value: k, label: noteKindLabel[k] }))}
        value={kind}
        onChange={changeKind}
      />
      <TextareaField
        label="متن"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={error}
        autoFocus={autoFocus}
        hint={
          kind === 'session' ? 'برای «جلسه» قالب کوتاه پیش‌فرض باز می‌شود؛ پاک‌کردنی است.' : undefined
        }
      />
      <RadioCards
        legend="چه کسی می‌بیند؟"
        options={visibilityOptions}
        value={visibility}
        onChange={setVisibility}
        hint={
          visibility === 'shared' ? (
            <span className="font-semibold text-primary-text">
              {`هنرجو این را می‌بیند: در خانه‌ی ${firstName} زیر «از مشاورت» می‌آید.`}
            </span>
          ) : visibility === 'private' ? (
            t('privateHint')
          ) : (
            'فقط مدیر و مشاورها می‌بینند.'
          )
        }
      />
      <fieldset className="mb-5">
        <legend className="mb-1.5 text-ui font-semibold">
          قدم بعدی <span className="font-normal text-fg-3">(اختیاری)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {onCreateTask ? (
            <ChipButton
              small
              pressed={followUp?.kind === 'task'}
              onClick={() => setFollowUp(followUp?.kind === 'task' ? null : { kind: 'task' })}
            >
              + کار از این یادداشت
            </ChipButton>
          ) : null}
          {[
            { days: 1, label: 'یادآور فردا' },
            { days: 3, label: 'یادآور ۳ روز' },
            { days: 7, label: 'یادآور ۱ هفته' },
          ].map((o) => {
            const on = followUp?.kind === 'reminder' && followUp.days === o.days;
            return (
              <ChipButton
                key={o.days}
                small
                pressed={on}
                onClick={() => setFollowUp(on ? null : { kind: 'reminder', days: o.days })}
              >
                {o.label}
              </ChipButton>
            );
          })}
        </div>
      </fieldset>
      <DialogActions>
        {onCancel ? <Button onClick={onCancel}>انصراف</Button> : null}
        <Button type="submit" variant="primary" loading={submitting}>
          ثبت یادداشت
        </Button>
      </DialogActions>
    </form>
  );
}

/** Segmented «داخلی / اشتراکی» switch of the inline composer (`.seg.vis-switch`). */
function VisibilitySwitch({
  value,
  onChange,
  options,
}: {
  value: NoteVisibility;
  onChange: (v: NoteVisibility) => void;
  options: Array<{ value: NoteVisibility; label: string; icon: 'lock' | 'eye' | 'user' }>;
}) {
  const name = useId();
  const t = useTranslations('notes');
  return (
    <fieldset className="inline-flex gap-0.5 rounded-[10px] border border-line bg-surface-3 p-[3px]">
      <legend className="sr-only">{t('visibilityLegend')}</legend>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              'inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-[7px] px-2.5 text-xs font-semibold has-[input:focus-visible]:shadow-ring',
              on
                ? o.value === 'shared'
                  ? 'bg-primary-weak-2 text-primary-text'
                  : 'bg-fg text-surface'
                : 'text-fg-2 hover:text-fg',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={on}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <Icon name={o.icon} size={14} />
            {o.label}
          </label>
        );
      })}
    </fieldset>
  );
}
