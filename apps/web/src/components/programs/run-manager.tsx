'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch, apiPost, apiRequest } from '@/components/api/client';
import { useFormat } from '@/components/format/use-format';
import { splitApiError } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { UsageLine } from '@/components/mentoring/session-bits';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { PageHead } from '@/components/ui/page-head';
import { Alert, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type {
  AssignNodeResultDTO,
  EnrollmentDTO,
  ProgressDTO,
  RunDTO,
} from '@/modules/programs/contracts';
import type { EnrollmentStatus, RunStatus, StaffRole } from '@/modules/programs/schema';
import { PhaseDialog } from './phase-dialog';
import { DayField, dayDate, isolate, RunStatusTag } from './program-bits';
import { ProgressMeter } from './progress-meter';

type Option = { id: string; label: string };

/** Same tables as programs/policy.ts (the server checks again). */
const RUN_NEXT: Record<RunStatus, RunStatus[]> = {
  draft: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['active', 'archived'],
  archived: [],
};
const ENROLLMENT_NEXT: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  active: ['paused', 'completed', 'dropped'],
  paused: ['active', 'completed', 'dropped'],
  completed: ['active'],
  dropped: ['active'],
};
const RUN_ACTION: Record<RunStatus, 'activate' | 'completeRun' | 'archive' | null> = {
  draft: null,
  active: 'activate',
  completed: 'completeRun',
  archived: 'archive',
};
const ENROLLMENT_ACTION: Record<EnrollmentStatus, 'resume' | 'pause' | 'complete' | 'drop'> = {
  active: 'resume',
  paused: 'pause',
  completed: 'complete',
  dropped: 'drop',
};
const ENROLLMENT_TAG = {
  active: 'gate',
  paused: 'outline',
  completed: 'neutral',
  dropped: 'neutral',
} as const;

type Editing =
  | { kind: 'run' }
  | { kind: 'enroll' }
  | { kind: 'staff' }
  | { kind: 'phase'; enrollment: EnrollmentDTO }
  | { kind: 'pause'; enrollment: EnrollmentDTO };

/**
 * Run page (ADR-0012): status, the phases copied from the template, staff and enrollments.
 * Enrollments move between phases with the stage-change rules (advance one, skip after an
 * assessment, exception or regress with a note). The main-path run is read-mostly: its
 * enrollments follow the student records, and a phase change there is a stage change.
 * Sprint 5: each member's progress and the run average; an assignment activity can be
 * assigned to the whole group (one task per member who has none yet). Sprint 5b: package use
 * (sessions used of the quota, days of validity left).
 */
export function RunManager({
  run: initial,
  viewerId,
  staffOptions,
  studentOptions,
}: {
  run: RunDTO;
  viewerId: string;
  staffOptions: Option[];
  studentOptions: Option[];
}) {
  const t = useTranslations('programs');
  const format = useFormat();
  const router = useRouter();
  const toast = useToast();
  const [run, setRun] = useState(initial);
  // A session or goal written next to this card refreshes the page; take the server's copy.
  useEffect(() => setRun(initial), [initial]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/program-runs/${run.id}`;
  const open = run.status === 'draft' || run.status === 'active';
  const full = run.mode === 'individual' && run.enrollments.some((e) => e.status !== 'dropped');
  const canEnroll = run.can.enroll && open && !run.isLegacy && !full;
  const canAssign = run.can.manage && open && !run.isLegacy;
  const phaseCount = run.phases.length;
  const progressText = (p: ProgressDTO) =>
    p.percent === null
      ? t('progress.unknown')
      : t('progress.value', { percent: p.percent, done: p.done, total: p.total });

  async function setRunStatus(status: RunStatus) {
    setBusy(`run-${status}`);
    setError(null);
    const result = await apiPatch<RunDTO>(base, { status });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setRun(result.data);
    toast.show({ message: t('toast.statusChanged') });
    router.refresh();
  }

  /** Replaces one enrollment with the server's copy. */
  function replace(enrollment: EnrollmentDTO) {
    setRun((r) => ({
      ...r,
      enrollments: r.enrollments.map((e) => (e.id === enrollment.id ? enrollment : e)),
    }));
  }

  async function setEnrollmentStatus(enrollment: EnrollmentDTO, status: EnrollmentStatus) {
    if (status === 'paused') {
      setEditing({ kind: 'pause', enrollment });
      return;
    }
    setBusy(enrollment.id);
    setError(null);
    const result = await apiPatch<EnrollmentDTO>(`/api/v1/enrollments/${enrollment.id}`, {
      status,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    replace(result.data);
    toast.show({ message: t('toast.statusChanged') });
    router.refresh();
  }

  async function assign(nodeId: string) {
    setBusy(`assign-${nodeId}`);
    setError(null);
    const result = await apiPost<AssignNodeResultDTO>(`${base}/nodes/${nodeId}/assign`, {});
    if (!result.ok) {
      setBusy(null);
      setError(result.error.message);
      return;
    }
    // The counts and progress come from the server's view of the run.
    const fresh = await apiGet<RunDTO>(base);
    setBusy(null);
    if (fresh.ok) setRun(fresh.data);
    toast.show({ message: t('toast.assigned', { created: result.data.created }) });
    router.refresh();
  }

  async function endStaff(userId: string) {
    setBusy(`staff-${userId}`);
    setError(null);
    const result = await apiRequest<RunDTO>('DELETE', `${base}/staff/${userId}`);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setRun(result.data);
    toast.show({ message: t('toast.staffEnded') });
    router.refresh();
  }

  const subParts = [
    run.template ? t('fromTemplate', { title: isolate(run.template.title) }) : t('kind.one_on_one'),
    t(`mode.${run.mode}`),
    run.startsOn && run.endsOn
      ? t('dates', {
          start: format.date(dayDate(run.startsOn)),
          end: format.date(dayDate(run.endsOn)),
        })
      : run.startsOn
        ? t('startsOn', { date: format.date(dayDate(run.startsOn)) })
        : null,
  ].filter(Boolean);

  return (
    <>
      <PageHead
        eyebrow={
          <Link href="/programs" className="hover:text-link">
            {t('title')}
          </Link>
        }
        title={<bdi>{run.title}</bdi>}
        sub={
          <>
            {run.isLegacy ? <Tag icon="route">{t('legacy')}</Tag> : null}
            <RunStatusTag status={run.status} />
            {subParts.map((part) => (
              <span key={part}>{part}</span>
            ))}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canEnroll ? (
              <Button variant="primary" onClick={() => setEditing({ kind: 'enroll' })}>
                <Icon name="plus" size={16} />
                {t('action.enroll')}
              </Button>
            ) : null}
            {run.can.manage && !run.isLegacy
              ? RUN_NEXT[run.status].map((status) => {
                  const action = RUN_ACTION[status];
                  if (!action) return null;
                  const label =
                    run.status === 'completed' && status === 'active'
                      ? t('action.reopen')
                      : t(`action.${action}`);
                  return (
                    <Button
                      key={status}
                      variant={status === 'archived' ? 'ghost' : 'secondary'}
                      loading={busy === `run-${status}`}
                      onClick={() => setRunStatus(status)}
                    >
                      {label}
                    </Button>
                  );
                })
              : null}
            {run.can.manage ? (
              <Button variant="secondary" onClick={() => setEditing({ kind: 'run' })}>
                <Icon name="pen" size={16} />
                {t('action.edit')}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-col gap-4 md:gap-5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {run.isLegacy ? <Alert tone="info">{t('legacyRunNote')}</Alert> : null}

        <Card aria-labelledby="h-enrollments">
          <CardHead
            title={t('enrollments')}
            titleId="h-enrollments"
            icon="users"
            count={run.enrollments.length}
            sub={
              run.enrollments.length
                ? `${t('progress.average')}: ${
                    run.averageProgress === null
                      ? t('progress.unknown')
                      : `${format.number(run.averageProgress)}${t('progress.percentSign')}`
                  }`
                : undefined
            }
          />
          {run.enrollments.length === 0 ? (
            <EmptyState icon="users" tone="brand" title={t('noEnrollments')} />
          ) : (
            <ul className="-mx-4 md:-mx-5">
              {run.enrollments.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 first:border-t-0 md:px-5',
                    e.status !== 'active' && 'bg-surface-2/50',
                  )}
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <Link
                      href={`/students/${e.student.id}`}
                      className="font-semibold text-fg hover:text-link"
                    >
                      {e.student.displayName}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
                      {e.phase ? (
                        <span>
                          {t('phaseOf', { position: e.phase.position, count: phaseCount })}
                          {' · '}
                          <bdi className="font-semibold text-fg">{e.phase.title}</bdi>
                        </span>
                      ) : (
                        <span>{t('noPhase')}</span>
                      )}
                      {e.daysInPhase !== null && e.status === 'active' ? (
                        <span>{t('inPhase', { count: e.daysInPhase })}</span>
                      ) : null}
                      {e.status === 'paused' && e.pausedUntil ? (
                        <span>
                          {t('pausedUntil', { date: format.date(dayDate(e.pausedUntil)) })}
                        </span>
                      ) : null}
                      {e.validUntil ? (
                        <span>{t('validUntil', { date: format.date(dayDate(e.validUntil)) })}</span>
                      ) : null}
                      {e.sessionQuota !== null ? <UsageLine usage={e.usage} /> : null}
                    </div>
                    {run.isLegacy ? null : (
                      <ProgressMeter
                        className="mt-1.5 max-w-80"
                        percent={e.progress.percent}
                        label={t('progress.label')}
                        text={progressText(e.progress)}
                      />
                    )}
                  </div>
                  <Tag variant={ENROLLMENT_TAG[e.status]}>{t(`enrollmentStatus.${e.status}`)}</Tag>
                  <div className="flex flex-wrap gap-1.5">
                    {phaseCount > 1 && e.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => setEditing({ kind: 'phase', enrollment: e })}
                      >
                        {t('action.changePhase')}
                      </Button>
                    ) : null}
                    {!run.isLegacy
                      ? ENROLLMENT_NEXT[e.status].map((status) => (
                          <Button
                            key={status}
                            size="sm"
                            variant={status === 'dropped' ? 'ghost' : 'secondary'}
                            loading={busy === e.id}
                            onClick={() => setEnrollmentStatus(e, status)}
                          >
                            {status === 'active' && e.status !== 'paused'
                              ? t('action.reactivate')
                              : t(`action.${ENROLLMENT_ACTION[status]}`)}
                          </Button>
                        ))
                      : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-4 md:gap-5 lg:grid-cols-[2fr_1fr]">
          <Card aria-labelledby="h-run-phases">
            <CardHead
              title={t('phases')}
              titleId="h-run-phases"
              icon="flag"
              count={phaseCount}
              sub={
                run.templateRevision !== null && !run.isLegacy
                  ? t('snapshot', { count: run.templateRevision })
                  : undefined
              }
            />
            {phaseCount === 0 ? (
              <p className="text-sm text-fg-3">{t('noPhases')}</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {run.phases.map((phase, index) => {
                  const here = run.enrollments.filter(
                    (e) => e.phase?.id === phase.id && e.status === 'active',
                  ).length;
                  return (
                    <li key={phase.id} className="rounded-sm border border-line">
                      <details>
                        <summary className="flex min-h-tap cursor-pointer items-center gap-3 px-3 py-2">
                          <span className="grid size-7 flex-none place-items-center rounded-full border-2 border-primary text-xs font-bold text-primary-text">
                            {format.number(index + 1)}
                          </span>
                          <bdi className="min-w-0 flex-1 font-semibold">{phase.title}</bdi>
                          {phase.isGate ? <Tag variant="gate">{t('gate')}</Tag> : null}
                          <span className="text-sm text-fg-3">
                            {t('activityCount', { count: phase.activities.length })}
                          </span>
                          {here ? (
                            <span className="inline-flex items-center gap-1 text-sm text-fg-2">
                              <Icon name="users" size={14} />
                              {format.number(here)}
                            </span>
                          ) : null}
                        </summary>
                        <ul className="border-t border-line px-3 py-2 text-sm">
                          {phase.activities.length === 0 ? (
                            <li className="text-fg-3">{t('noActivities')}</li>
                          ) : (
                            phase.activities.map((a) => {
                              const counts = run.assignments[a.id];
                              return (
                                <li
                                  key={a.id}
                                  className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1"
                                >
                                  <Tag variant="outline" icon={null}>
                                    {t(`nodeType.${a.nodeType}`)}
                                  </Tag>
                                  <bdi className="min-w-0 flex-1">{a.title}</bdi>
                                  {a.nodeType === 'assignment' && !run.isLegacy ? (
                                    <span className="text-xs text-fg-2">
                                      {t('progress.assigned', {
                                        assigned: counts?.assigned ?? 0,
                                        accepted: counts?.accepted ?? 0,
                                      })}
                                    </span>
                                  ) : null}
                                  {a.nodeType === 'assignment' && canAssign ? (
                                    <Button
                                      size="sm"
                                      variant="soft"
                                      loading={busy === `assign-${a.id}`}
                                      onClick={() => assign(a.id)}
                                    >
                                      {t('action.assign')}
                                    </Button>
                                  ) : null}
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </details>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card aria-labelledby="h-staff">
            <CardHead
              title={t('staff')}
              titleId="h-staff"
              icon="user"
              actions={
                run.can.manageStaff && !run.isLegacy ? (
                  <Button size="sm" variant="soft" onClick={() => setEditing({ kind: 'staff' })}>
                    <Icon name="plus" size={14} />
                    {t('action.addStaff')}
                  </Button>
                ) : undefined
              }
            />
            {run.staff.length === 0 ? (
              <p className="text-sm text-fg-3">{t('noStaff')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {run.staff.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 font-semibold">{s.displayName}</span>
                    <Tag>{t(`staffRole.${s.role}`)}</Tag>
                    {run.can.manageStaff && !run.isLegacy && s.id !== viewerId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `staff-${s.id}`}
                        onClick={() => endStaff(s.id)}
                      >
                        {t('action.endStaff')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editing?.kind === 'run' ? (
        <RunDialog
          run={run}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setRun(saved);
            setEditing(null);
            toast.show({ message: t('toast.saved') });
            router.refresh();
          }}
        />
      ) : null}
      {editing?.kind === 'enroll' ? (
        <EnrollDialog
          run={run}
          options={studentOptions.filter(
            (o) => !run.enrollments.some((e) => e.student.id === o.id),
          )}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setRun(saved);
            setEditing(null);
            toast.show({ message: t('toast.enrolled') });
            router.refresh();
          }}
        />
      ) : null}
      {editing?.kind === 'staff' ? (
        <StaffDialog
          base={base}
          options={staffOptions.filter((o) => !run.staff.some((s) => s.id === o.id))}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setRun(saved);
            setEditing(null);
            toast.show({ message: t('toast.staffAdded') });
            router.refresh();
          }}
        />
      ) : null}
      {editing?.kind === 'phase' ? (
        <PhaseDialog
          enrollmentId={editing.enrollment.id}
          studentName={editing.enrollment.student.displayName}
          phases={run.phases}
          currentPosition={editing.enrollment.phase?.position ?? null}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            replace(saved);
            setEditing(null);
            toast.show({ message: t('toast.phaseChanged') });
            router.refresh();
          }}
        />
      ) : null}
      {editing?.kind === 'pause' ? (
        <PauseDialog
          enrollment={editing.enrollment}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            replace(saved);
            setEditing(null);
            toast.show({ message: t('toast.statusChanged') });
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function RunDialog({
  run,
  onClose,
  onSaved,
}: {
  run: RunDTO;
  onClose: () => void;
  onSaved: (run: RunDTO) => void;
}) {
  const t = useTranslations('programs');
  const tc = useTranslations('common');
  const [title, setTitle] = useState(run.title);
  const [startsOn, setStartsOn] = useState(run.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(run.endsOn ?? '');
  const [errors, setErrors] = useState<Partial<Record<'title' | 'startsOn' | 'endsOn', string>>>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const body = run.isLegacy
      ? { title }
      : { title, startsOn: startsOn || null, endsOn: endsOn || null };
    const result = await apiPatch<RunDTO>(`/api/v1/program-runs/${run.id}`, body);
    setBusy(false);
    if (!result.ok) {
      const split = splitApiError(result.error, ['title', 'startsOn', 'endsOn'] as const);
      setErrors(split.fields);
      setFormError(split.form);
      return;
    }
    onSaved(result.data);
  }

  return (
    <Dialog open onClose={onClose} title={t('action.edit')}>
      <form onSubmit={submit} noValidate>
        {formError ? (
          <Alert tone="error" className="mb-4">
            {formError}
          </Alert>
        ) : null}
        <TextField
          label={t('field.title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          maxLength={160}
          required
        />
        {!run.isLegacy ? (
          <div className="grid gap-x-4 sm:grid-cols-2">
            <DayField
              label={t('optional', { label: t('field.startsOn') })}
              value={startsOn}
              onChange={setStartsOn}
              error={errors.startsOn}
            />
            <DayField
              label={t('optional', { label: t('field.endsOn') })}
              value={endsOn}
              onChange={setEndsOn}
              min={startsOn || undefined}
              error={errors.endsOn}
            />
          </div>
        ) : null}
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('action.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EnrollDialog({
  run,
  options,
  onClose,
  onSaved,
}: {
  run: RunDTO;
  options: Option[];
  onClose: () => void;
  onSaved: (run: RunDTO) => void;
}) {
  const t = useTranslations('programs');
  const tc = useTranslations('common');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const single = run.mode === 'individual';
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function toggle(id: string) {
    setPicked((list) =>
      single ? [id] : list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    const result = await apiPost<RunDTO>(`/api/v1/program-runs/${run.id}/enrollments`, {
      studentIds: picked,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSaved(result.data);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('enrollTitle', { title: isolate(run.title) })}
      description={single ? t('individualOne') : t('enrollHint')}
    >
      <form onSubmit={submit} noValidate>
        {error ? (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        ) : null}
        {options.length === 0 ? (
          <p className="mb-4 text-ui text-fg-3">{t('enrollNone')}</p>
        ) : (
          <>
            <TextField
              label={t('field.search')}
              hideLabel
              placeholder={t('field.search')}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              fieldClassName="mb-3"
            />
            <fieldset className="mb-4 max-h-72 overflow-y-auto rounded-sm border border-line">
              <legend className="sr-only">{t('field.search')}</legend>
              {shown.map((o) => (
                <label
                  key={o.id}
                  className="flex min-h-tap cursor-pointer items-center gap-2.5 border-t border-line px-3 first:border-t-0 hover:bg-hover"
                >
                  <input
                    type={single ? 'radio' : 'checkbox'}
                    name="students"
                    className="size-[18px] flex-none accent-primary"
                    checked={picked.includes(o.id)}
                    onChange={() => toggle(o.id)}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </fieldset>
            {!single ? (
              <p className="mb-2 text-sm text-fg-2" aria-live="polite">
                {t('enrollSelected', { count: picked.length })}
              </p>
            ) : null}
          </>
        )}
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={picked.length === 0}>
            {t('action.enroll')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function StaffDialog({
  base,
  options,
  onClose,
  onSaved,
}: {
  base: string;
  options: Option[];
  onClose: () => void;
  onSaved: (run: RunDTO) => void;
}) {
  const t = useTranslations('programs');
  const tc = useTranslations('common');
  const [userId, setUserId] = useState(options[0]?.id ?? '');
  const [role, setRole] = useState<StaffRole>('mentor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    setError(null);
    const result = await apiPost<RunDTO>(`${base}/staff`, { userId, role });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSaved(result.data);
  }

  return (
    <Dialog open onClose={onClose} title={t('action.addStaff')}>
      <form onSubmit={submit} noValidate>
        {error ? (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        ) : null}
        <SelectField
          label={t('field.person')}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('field.role')}
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
        >
          <option value="mentor">{t('staffRole.mentor')}</option>
          <option value="manager">{t('staffRole.manager')}</option>
        </SelectField>
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!userId}>
            {t('action.addStaff')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** The usual kind for a target: next → advance, earlier → regress, further → skip. */
function PauseDialog({
  enrollment,
  onClose,
  onSaved,
}: {
  enrollment: EnrollmentDTO;
  onClose: () => void;
  onSaved: (enrollment: EnrollmentDTO) => void;
}) {
  const t = useTranslations('programs');
  const tc = useTranslations('common');
  const [until, setUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiPatch<EnrollmentDTO>(`/api/v1/enrollments/${enrollment.id}`, {
      status: 'paused',
      pausedUntil: until || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.fields.pausedUntil ?? result.error.message);
      return;
    }
    onSaved(result.data);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('pauseTitle', { name: isolate(enrollment.student.displayName) })}
    >
      <form onSubmit={submit} noValidate>
        <DayField label={t('field.pausedUntil')} value={until} onChange={setUntil} error={error} />
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('action.pause')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
