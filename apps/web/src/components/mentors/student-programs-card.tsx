'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { apiDelete, apiPost } from '@/components/api/client';
import { Icon } from '@/components/icons/icon';
import { UsageLine } from '@/components/mentoring/session-bits';
import { PhaseDialog } from '@/components/programs/phase-dialog';
import { isolate } from '@/components/programs/program-text';
import { ProgressMeter } from '@/components/programs/progress-meter';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField } from '@/components/ui/field';
import { Alert, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { MentorCardDTO } from '@/modules/mentors/contracts';
import type { EnrollmentMentorRole, StudentEnrollmentDTO } from '@/modules/programs/contracts';

type Mentor = StudentEnrollmentDTO['mentors'][number];
type Capacity = Pick<MentorCardDTO, 'id' | 'displayName' | 'profile' | 'counts'>;

/**
 * «Programs and mentors» on the staff student page (Coach Office sprint 4): each enrollment
 * with its phase and current mentors. The admin adds a primary (which hands over) or a
 * secondary mentor, and ends one; on the main path the primary is the student's mentor.
 * Sprint 5: the program progress of each enrollment (not for the main path). Sprint 5c: "Change
 * phase" for a course other than the main path (the main path keeps "Change stage").
 */
export function StudentProgramsCard({
  studentName,
  enrollments,
  mentors,
  canAssign,
}: {
  studentName: string;
  enrollments: StudentEnrollmentDTO[];
  /** Active staff with their capacity (admin only; empty for mentors). */
  mentors: Capacity[];
  canAssign: boolean;
}) {
  const t = useTranslations('mentors.studentCard');
  const tp = useTranslations('programs');
  const tr = useTranslations('mentors.mentorRole');
  const router = useRouter();
  const toast = useToast();
  const [assignFor, setAssignFor] = useState<StudentEnrollmentDTO | null>(null);
  const [moving, setMoving] = useState<StudentEnrollmentDTO | null>(null);
  const [ending, setEnding] = useState<{ enrollment: StudentEnrollmentDTO; mentor: Mentor } | null>(
    null,
  );

  return (
    <Card id="programs" aria-labelledby="h-pg" className="scroll-mt-28">
      <CardHead title={t('title')} titleId="h-pg" icon="flag" count={enrollments.length} />
      {enrollments.length === 0 ? (
        <EmptyState icon="flag" title={t('empty')} />
      ) : (
        <ul className="-mx-4 md:-mx-5">
          {enrollments.map((e) => (
            <li key={e.id} className="border-t border-line px-4 py-3 first:border-t-0 md:px-5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  href={`/programs/runs/${e.run.id}`}
                  className="min-w-0 flex-1 leading-6 font-semibold text-fg hover:text-link"
                >
                  <bdi>{e.run.isLegacy ? tp('legacy') : e.run.title}</bdi>
                </Link>
                <Tag>{tp(`enrollmentStatus.${e.status}`)}</Tag>
                {!e.run.isLegacy && e.status === 'active' && e.phases.length > 1 ? (
                  <Button size="sm" variant="soft" onClick={() => setMoving(e)}>
                    {tp('action.changePhase')}
                  </Button>
                ) : null}
              </div>
              {e.phase ? (
                <p className="mt-0.5 text-sm text-fg-2">
                  {tp('phaseOf', { position: e.phase.position, count: e.phase.count })}
                  {' · '}
                  <bdi>{e.phase.title}</bdi>
                </p>
              ) : null}
              {e.run.isLegacy ? null : (
                <ProgressMeter
                  className="mt-1.5 max-w-80"
                  percent={e.progress.percent}
                  label={tp('progress.label')}
                  text={
                    e.progress.percent === null
                      ? tp('progress.unknown')
                      : tp('progress.value', {
                          percent: e.progress.percent,
                          done: e.progress.done,
                          total: e.progress.total,
                        })
                  }
                />
              )}
              {e.usage.quota !== null ? (
                <p className="mt-1 text-sm text-fg-2">
                  <UsageLine usage={e.usage} />
                </p>
              ) : null}
              <ul className="mt-2 flex flex-wrap items-center gap-1.5">
                {e.mentors.length === 0 ? (
                  <li className="text-sm text-fg-3">{t('noMentor')}</li>
                ) : (
                  e.mentors.map((m) => (
                    <li
                      key={m.id}
                      className="inline-flex min-h-7 items-center gap-1 rounded-full border border-line bg-surface-2 ps-2.5 pe-1 text-sm"
                    >
                      <Icon name={m.role === 'primary' ? 'user' : 'users'} size={14} />
                      <bdi className="font-semibold">{m.displayName}</bdi>
                      <span className="text-fg-3">{tr(m.role)}</span>
                      {canAssign ? (
                        <button
                          type="button"
                          onClick={() => setEnding({ enrollment: e, mentor: m })}
                          className="grid size-6 cursor-pointer place-items-center rounded-full text-fg-3 hover:bg-hover hover:text-fg"
                        >
                          <Icon name="x" size={12} />
                          <span className="sr-only">{t('end', { name: m.displayName })}</span>
                        </button>
                      ) : (
                        <span className="pe-1.5" />
                      )}
                    </li>
                  ))
                )}
                {canAssign ? (
                  <li>
                    <Button size="sm" variant="ghost" onClick={() => setAssignFor(e)}>
                      <Icon name="plus" size={14} />
                      {t('assign')}
                    </Button>
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {moving ? (
        <PhaseDialog
          enrollmentId={moving.id}
          studentName={studentName}
          phases={moving.phases}
          currentPosition={moving.phase?.position ?? null}
          onClose={() => setMoving(null)}
          onSaved={() => {
            setMoving(null);
            toast.show({ message: tp('toast.phaseChanged') });
            router.refresh();
          }}
        />
      ) : null}
      {assignFor ? (
        <AssignDialog enrollment={assignFor} mentors={mentors} onClose={() => setAssignFor(null)} />
      ) : null}
      {ending ? (
        <EndDialog
          enrollmentId={ending.enrollment.id}
          mentor={ending.mentor}
          onClose={() => setEnding(null)}
        />
      ) : null}
    </Card>
  );
}

function AssignDialog({
  enrollment,
  mentors,
  onClose,
}: {
  enrollment: StudentEnrollmentDTO;
  mentors: Capacity[];
  onClose: () => void;
}) {
  const t = useTranslations('mentors.studentCard');
  const tm = useTranslations('mentors');
  const tr = useTranslations('mentors.mentorRole');
  const tp = useTranslations('programs');
  const tc = useTranslations('common');
  const router = useRouter();
  const toast = useToast();
  const current = new Set(enrollment.mentors.map((m) => m.id));
  const hasPrimary = enrollment.mentors.some((m) => m.role === 'primary');
  const options = mentors.filter((m) => !current.has(m.id) || !hasPrimary);
  const [mentorId, setMentorId] = useState(options[0]?.id ?? '');
  const [role, setRole] = useState<EnrollmentMentorRole>(hasPrimary ? 'secondary' : 'primary');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = mentors.find((m) => m.id === mentorId);
  const full =
    role === 'primary' &&
    chosen?.profile.capacity != null &&
    chosen.counts.primary >= chosen.profile.capacity;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mentorId) return;
    setBusy(true);
    setError(null);
    const result = await apiPost(`/api/v1/enrollments/${enrollment.id}/mentors`, {
      mentorId,
      role,
      ...(reason.trim() ? { reason } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.show({ message: t('assigned') });
    onClose();
    router.refresh();
  }

  const title = enrollment.run.isLegacy ? tp('legacy') : enrollment.run.title;
  return (
    <Dialog open onClose={onClose} title={t('assignTitle', { title: isolate(title) })}>
      <form onSubmit={submit} noValidate>
        {error ? (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        ) : null}
        <SelectField
          label={t('mentor')}
          value={mentorId}
          onChange={(e) => setMentorId(e.target.value)}
          hint={options.length ? undefined : tm('noOther')}
        >
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('role')}
          value={role}
          onChange={(e) => setRole(e.target.value as EnrollmentMentorRole)}
          hint={role === 'primary' ? t('primaryHint') : t('secondaryHint')}
        >
          <option value="primary">{tr('primary')}</option>
          <option value="secondary">{tr('secondary')}</option>
        </SelectField>
        {full && chosen ? (
          <Alert tone="warn" className="mb-4">
            {t('atCapacity', {
              name: isolate(chosen.displayName),
              used: chosen.counts.primary,
              capacity: chosen.profile.capacity ?? 0,
            })}
          </Alert>
        ) : null}
        <TextareaField
          label={tm('reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!mentorId}>
            {t('assign')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EndDialog({
  enrollmentId,
  mentor,
  onClose,
}: {
  enrollmentId: string;
  mentor: Mentor;
  onClose: () => void;
}) {
  const t = useTranslations('mentors.studentCard');
  const tc = useTranslations('common');
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function end() {
    setBusy(true);
    setError(null);
    const result = await apiDelete(`/api/v1/enrollments/${enrollmentId}/mentors/${mentor.id}`);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.show({ message: t('ended') });
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('endTitle', { name: isolate(mentor.displayName) })}
      description={t('endBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void end()}>
            {t('endConfirm')}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Dialog>
  );
}
