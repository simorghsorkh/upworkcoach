'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { apiPut } from '@/components/api/client';
import { splitApiError } from '@/components/forms/form-utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import type { EnrollmentDTO } from '@/modules/programs/contracts';
import { isolate } from './program-text';

type PhaseKind = 'advance' | 'skip_by_assessment' | 'advance_with_exception' | 'regress';

/**
 * Moves an enrollment to another phase with the stage-change rules (advance one, skip after
 * an assessment, exception or regress with a note). Used by the run page, the course board
 * and the student record (sprint 5c).
 */
function defaultKind(from: number | null, to: number): PhaseKind {
  if (from === null || to === from + 1) return 'advance';
  return to < from ? 'regress' : 'skip_by_assessment';
}

export function PhaseDialog({
  enrollmentId,
  studentName,
  phases,
  currentPosition,
  onClose,
  onSaved,
}: {
  enrollmentId: string;
  studentName: string;
  /** The run's phases in order. */
  phases: ReadonlyArray<{ id: string; title: string }>;
  /** 1-based position of the current phase (null: none yet). */
  currentPosition: number | null;
  onClose: () => void;
  onSaved: (enrollment: EnrollmentDTO) => void;
}) {
  const t = useTranslations('programs');
  const tc = useTranslations('common');
  const current = currentPosition;
  const targets = phases
    .map((p, i) => ({ id: p.id, title: p.title, position: i + 1 }))
    .filter((p) => p.position !== current);
  const first = targets.find((p) => current === null || p.position === current + 1) ?? targets[0];
  const [toNodeId, setTo] = useState(first?.id ?? '');
  const [kind, setKind] = useState<PhaseKind>(defaultKind(current, first?.position ?? 1));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'note' | 'toNodeId' | 'kind', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsNote = kind === 'regress' || kind === 'advance_with_exception';

  function pick(id: string) {
    setTo(id);
    const target = targets.find((p) => p.id === id);
    if (target) setKind(defaultKind(current, target.position));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const result = await apiPut<EnrollmentDTO>(`/api/v1/enrollments/${enrollmentId}/phase`, {
      toNodeId,
      kind,
      note: note.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      const split = splitApiError(result.error, ['note', 'toNodeId', 'kind'] as const);
      setErrors(split.fields);
      setFormError(split.form);
      return;
    }
    onSaved(result.data);
  }

  return (
    <Dialog open onClose={onClose} title={t('phaseTitle', { name: isolate(studentName) })}>
      <form onSubmit={submit} noValidate>
        {formError ? (
          <Alert tone="error" className="mb-4">
            {formError}
          </Alert>
        ) : null}
        <SelectField
          label={t('field.toPhase')}
          value={toNodeId}
          onChange={(e) => pick(e.target.value)}
          error={errors.toNodeId}
        >
          {targets.map((p) => (
            <option key={p.id} value={p.id}>
              {t('phaseOf', { position: p.position, count: phases.length })} — {p.title}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('field.phaseKind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as PhaseKind)}
          error={errors.kind}
        >
          {(['advance', 'skip_by_assessment', 'advance_with_exception', 'regress'] as const).map(
            (k) => (
              <option key={k} value={k}>
                {t(`phaseKind.${k}`)}
              </option>
            ),
          )}
        </SelectField>
        <TextareaField
          label={needsNote ? t('field.note') : t('optional', { label: t('field.note') })}
          hint={t('noteRequiredHint')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={errors.note}
          rows={3}
        />
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!toNodeId}>
            {t('action.changePhase')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
