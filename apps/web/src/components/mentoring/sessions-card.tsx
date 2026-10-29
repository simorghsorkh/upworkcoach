'use client';

import { useRouter } from 'next/navigation';
import { useTimeZone, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '@/components/api/client';
import { Icon } from '@/components/icons/icon';
import { DayField, isolate } from '@/components/programs/program-bits';
import { Button } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { dayIn, partsIn } from '@/lib/org-day';
import type { SessionDTO, SessionWriteDTO } from '@/modules/mentoring/contracts';
import { SessionLine } from './session-bits';

export type SessionMember = { enrollmentId: string; studentId: string; name: string };

type Editing =
  | { kind: 'book' }
  | { kind: 'reschedule'; session: SessionDTO }
  | { kind: 'cancel'; session: SessionDTO }
  | { kind: 'action'; session: SessionDTO };

const DEFAULT_ZONE = 'Asia/Tehran';

/**
 * Mentoring sessions of a run (ADR-0012 §7, sprint 5b): book one for a member or the whole
 * group, record held / no-show / cancelled, reschedule, and leave a next action that becomes the
 * mentee's task. An overlap with the mentor's other sessions only warns.
 */
export function SessionsCard({
  runId,
  members,
  allowGroup,
  canBook,
  defaultMinutes,
  initial,
}: {
  runId: string;
  /** Members who hold a seat. */
  members: SessionMember[];
  allowGroup: boolean;
  canBook: boolean;
  defaultMinutes: number;
  initial: { upcoming: SessionDTO[]; past: SessionDTO[] };
}) {
  const t = useTranslations('mentoring');
  const router = useRouter();
  const toast = useToast();
  const [lists, setLists] = useState(initial);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overlap, setOverlap] = useState(0);
  const now = new Date();

  async function reload() {
    const base = `/api/v1/sessions?runId=${runId}`;
    const [upcoming, past] = await Promise.all([
      apiGet<SessionDTO[]>(`${base}&when=upcoming`),
      apiGet<SessionDTO[]>(`${base}&when=past`),
    ]);
    if (upcoming.ok && past.ok) setLists({ upcoming: upcoming.data, past: past.data });
    router.refresh();
  }

  async function written(result: SessionWriteDTO, message: string) {
    setOverlap(result.overlaps);
    setEditing(null);
    toast.show({ message });
    await reload();
  }

  async function patch(session: SessionDTO, body: Record<string, unknown>) {
    setBusy(session.id);
    setError(null);
    const result = await apiPatch<SessionWriteDTO>(`/api/v1/sessions/${session.id}`, body);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await written(result.data, t('toast.updated'));
  }

  function buttons(s: SessionDTO) {
    if (!s.can.edit) return null;
    const loading = busy === s.id;
    if (s.status === 'scheduled') {
      return (
        <>
          <Button
            size="sm"
            variant="soft"
            loading={loading}
            onClick={() => patch(s, { status: 'held' })}
          >
            <Icon name="check" size={14} />
            {t('action.held')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={loading}
            onClick={() => patch(s, { status: 'no_show' })}
          >
            {t('action.noShow')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing({ kind: 'reschedule', session: s })}
          >
            {t('action.reschedule')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing({ kind: 'cancel', session: s })}
          >
            {t('action.cancel')}
          </Button>
        </>
      );
    }
    return (
      <>
        {s.status === 'held' ? (
          <Button
            size="sm"
            variant="soft"
            onClick={() => setEditing({ kind: 'action', session: s })}
          >
            <Icon name="plus" size={14} />
            {t('action.nextAction')}
          </Button>
        ) : null}
        {s.status === 'no_show' ? (
          <Button
            size="sm"
            variant="secondary"
            loading={loading}
            onClick={() => patch(s, { countsTowardQuota: !s.countsTowardQuota })}
          >
            {s.countsTowardQuota ? t('action.excuse') : t('action.count')}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          loading={loading}
          onClick={() => patch(s, { status: 'scheduled' })}
        >
          {t('action.reopen')}
        </Button>
      </>
    );
  }

  const section = (title: string, sessions: SessionDTO[], empty: string) => (
    <>
      <h3 className="mt-3 mb-1 text-sm font-semibold text-fg-2 first:mt-0">{title}</h3>
      {sessions.length ? (
        <ul className="-mx-4 md:-mx-5">
          {sessions.map((s) => (
            <li key={s.id} className="border-t border-line px-4 py-3 md:px-5">
              <SessionLine session={s} now={now} actions={buttons(s)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-3">{empty}</p>
      )}
    </>
  );

  return (
    <Card aria-labelledby="h-sessions">
      <CardHead
        title={t('title')}
        titleId="h-sessions"
        icon="calendar"
        count={lists.upcoming.length || undefined}
        actions={
          canBook && (members.length || allowGroup) ? (
            <Button size="sm" variant="soft" onClick={() => setEditing({ kind: 'book' })}>
              <Icon name="plus" size={14} />
              {t('action.book')}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <Alert tone="error" className="mb-2">
          {error}
        </Alert>
      ) : null}
      {overlap ? (
        <Alert tone="warn" className="mb-2">
          {t('overlap', { count: overlap })}
        </Alert>
      ) : null}
      {section(t('upcoming'), lists.upcoming, t('noneUpcoming'))}
      {lists.past.length ? section(t('past'), lists.past, t('nonePast')) : null}

      {editing?.kind === 'book' || editing?.kind === 'reschedule' ? (
        <SessionDialog
          runId={runId}
          members={members}
          allowGroup={allowGroup}
          defaultMinutes={defaultMinutes}
          session={editing.kind === 'reschedule' ? editing.session : null}
          onClose={() => setEditing(null)}
          onSaved={(result) =>
            written(result, editing.kind === 'book' ? t('toast.booked') : t('toast.updated'))
          }
        />
      ) : null}
      {editing?.kind === 'cancel' ? (
        <CancelDialog
          session={editing.session}
          onClose={() => setEditing(null)}
          onSaved={(result) => written(result, t('toast.updated'))}
        />
      ) : null}
      {editing?.kind === 'action' ? (
        <ActionDialog
          session={editing.session}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast.show({ message: t('toast.actionAdded') });
            await reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function SessionDialog({
  runId,
  members,
  allowGroup,
  defaultMinutes,
  session,
  onClose,
  onSaved,
}: {
  runId: string;
  members: SessionMember[];
  allowGroup: boolean;
  defaultMinutes: number;
  session: SessionDTO | null;
  onClose: () => void;
  onSaved: (result: SessionWriteDTO) => void;
}) {
  const t = useTranslations('mentoring');
  const tc = useTranslations('common');
  const zone = useTimeZone() ?? DEFAULT_ZONE;
  const today = dayIn(zone, new Date());
  const start = session ? partsIn(zone, new Date(session.scheduledAt)) : null;
  const [member, setMember] = useState(members[0]?.enrollmentId ?? '');
  const [day, setDay] = useState(session ? dayIn(zone, new Date(session.scheduledAt)) : today);
  const [time, setTime] = useState(start ? `${pad(start.hour)}:${pad(start.minute)}` : '10:00');
  const [minutes, setMinutes] = useState(String(session?.durationMinutes ?? defaultMinutes));
  const [location, setLocation] = useState(session?.location ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const body = {
      day,
      time,
      durationMinutes: Number(minutes),
      location: location.trim() || null,
    };
    const result = session
      ? await apiPatch<SessionWriteDTO>(`/api/v1/sessions/${session.id}`, body)
      : await apiPost<SessionWriteDTO>('/api/v1/sessions', {
          ...body,
          runId,
          enrollmentId: member || null,
        });
    setBusy(false);
    if (!result.ok) {
      const { fields, message } = result.error;
      setErrors(Object.keys(fields).length ? fields : { form: message });
      return;
    }
    onSaved(result.data);
  }

  return (
    <Dialog open onClose={onClose} title={session ? t('dialog.reschedule') : t('dialog.book')}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {errors.form ? <Alert tone="error">{errors.form}</Alert> : null}
        {session ? null : (
          <SelectField
            label={t('field.member')}
            value={member}
            error={errors.enrollmentId}
            onChange={(e) => setMember(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.enrollmentId} value={m.enrollmentId}>
                {m.name}
              </option>
            ))}
            {allowGroup ? <option value="">{t('field.wholeGroup')}</option> : null}
          </SelectField>
        )}
        <DayField label={t('field.day')} value={day} onChange={setDay} error={errors.day} />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            type="time"
            dir="ltr"
            label={t('field.time')}
            value={time}
            error={errors.time}
            onChange={(e) => setTime(e.target.value)}
          />
          <TextField
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            step={5}
            label={t('field.duration')}
            value={minutes}
            error={errors.durationMinutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
        <TextField
          label={t('field.location')}
          optional
          hint={t('field.locationHint')}
          value={location}
          error={errors.location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {session ? tc('save') : t('action.book')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function CancelDialog({
  session,
  onClose,
  onSaved,
}: {
  session: SessionDTO;
  onClose: () => void;
  onSaved: (result: SessionWriteDTO) => void;
}) {
  const t = useTranslations('mentoring');
  const tc = useTranslations('common');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiPatch<SessionWriteDTO>(`/api/v1/sessions/${session.id}`, {
      status: 'cancelled',
      cancelledReason: reason.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.fields.cancelledReason ?? result.error.message);
      return;
    }
    onSaved(result.data);
  }

  return (
    <Dialog open onClose={onClose} title={t('dialog.cancel')}>
      <form onSubmit={submit} noValidate>
        <TextField
          label={t('field.reason')}
          optional
          value={reason}
          error={error}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('action.cancel')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ActionDialog({
  session,
  members,
  onClose,
  onSaved,
}: {
  session: SessionDTO;
  members: SessionMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('mentoring');
  const tc = useTranslations('common');
  const zone = useTimeZone() ?? DEFAULT_ZONE;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');
  const [student, setStudent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const group = session.student === null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const result = await apiPost<SessionDTO>(`/api/v1/sessions/${session.id}/actions`, {
      title,
      description: description.trim() || null,
      dueDate: due,
      ...(group ? { studentId: student || undefined } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      const { fields, message } = result.error;
      setErrors(Object.keys(fields).length ? fields : { form: message });
      return;
    }
    onSaved();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('dialog.nextAction')}
      description={
        session.student
          ? `${t('dialog.nextActionHint')} (${isolate(session.student.displayName)})`
          : t('dialog.nextActionHint')
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {errors.form ? <Alert tone="error">{errors.form}</Alert> : null}
        {group ? (
          <SelectField
            label={t('field.actionStudent')}
            value={student}
            error={errors.studentId}
            onChange={(e) => setStudent(e.target.value)}
          >
            <option value="">{t('field.pickStudent')}</option>
            {members.map((m) => (
              <option key={m.studentId} value={m.studentId}>
                {m.name}
              </option>
            ))}
          </SelectField>
        ) : null}
        <TextField
          label={t('field.actionTitle')}
          value={title}
          error={errors.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextareaField
          label={t('field.actionDescription')}
          optional
          rows={3}
          value={description}
          error={errors.description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <DayField
          label={t('field.dueDate')}
          value={due}
          min={dayIn(zone, new Date())}
          onChange={setDue}
          error={errors.dueDate}
        />
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('action.nextAction')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
