'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { apiPut } from '@/components/api/client';
import { faDays, faNumber } from '@/components/format/fa';
import { CheckboxField } from '@/components/forms/form-utils';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { TaskTemplateDTO } from '@/modules/catalog/contracts';
import type { ChangeStageInput, ChangeStageResultDTO } from '@/modules/path/contracts';

export type PathStage = { id: string; name: string; displayCode: string };

export type StageMoveTarget = {
  id: string;
  displayName: string;
  stage: PathStage;
  daysInStage: number;
};

/**
 * Transition kind from the direction of the move (backend assumption 4): back = `regress`,
 * the next stage = `advance`, a jump forward = `skip_by_assessment`. A note is required for
 * going back and for jumps (user-flows §3).
 */
export function transitionFor(
  stages: readonly PathStage[],
  fromId: string,
  toId: string,
): { kind: ChangeStageInput['kind']; noteRequired: boolean } {
  const from = stages.findIndex((s) => s.id === fromId);
  const to = stages.findIndex((s) => s.id === toId);
  if (from === -1 || to === -1) return { kind: 'advance', noteRequired: false };
  if (to < from) return { kind: 'regress', noteRequired: true };
  if (to === from + 1) return { kind: 'advance', noteRequired: false };
  return { kind: 'skip_by_assessment', noteRequired: true };
}

const OTHER = '__other__';

/**
 * M3g / kanban «انتقال به…»: one click for the next stage (preselected), previous stage with a
 * required reason, any other stage from a list. `PUT /api/v1/students/:id/stage`.
 */
export type SuggestedTemplate = Pick<
  TaskTemplateDTO,
  'id' | 'stageId' | 'title' | 'defaultDueDays' | 'suggestOnStageEntry' | 'isActive'
>;
export type OpenStageTask = { id: string; title: string; stageId: string | null };

export function ChangeStageDialog({
  student,
  stages,
  open,
  onClose,
  templates = [],
  openTasks = [],
}: {
  student: StageMoveTarget | null;
  /** Active stages of the path, in order. */
  stages: readonly PathStage[];
  open: boolean;
  onClose: () => void;
  /** Task templates; those of the target stage with `suggestOnStageEntry` are offered. */
  templates?: readonly SuggestedTemplate[];
  /** The student's unfinished tasks («کارهای باز مرحله‌ی قبل: باز بمانند / لغو شوند»). */
  openTasks?: readonly OpenStageTask[];
}) {
  const firstName = student?.displayName.trim().split(/\s+/)[0] ?? '';
  return (
    <Dialog
      open={open && student !== null}
      onClose={onClose}
      title={student ? `تغییر مرحله‌ی ${firstName}` : 'تغییر مرحله'}
      description={
        student
          ? `فعلی: ${student.stage.displayCode} ${student.stage.name} · ${faDays(student.daysInStage)}`
          : undefined
      }
    >
      {/* The dialog mounts its body only while open, so the form starts fresh every time. */}
      {student ? (
        <ChangeStageForm
          key={student.id}
          student={student}
          stages={stages}
          onClose={onClose}
          templates={templates}
          openTasks={openTasks}
        />
      ) : null}
    </Dialog>
  );
}

function ChangeStageForm({
  student,
  stages,
  onClose,
  templates,
  openTasks,
}: {
  student: StageMoveTarget;
  stages: readonly PathStage[];
  onClose: () => void;
  templates: readonly SuggestedTemplate[];
  openTasks: readonly OpenStageTask[];
}) {
  const router = useRouter();
  const toast = useToast();
  const groupId = useId();
  const index = stages.findIndex((s) => s.id === student.stage.id);
  const prev = index > 0 ? stages[index - 1] : undefined;
  const next = index >= 0 && index < stages.length - 1 ? stages[index + 1] : undefined;
  const others = stages.filter(
    (s) => s.id !== student.stage.id && s.id !== prev?.id && s.id !== next?.id,
  );

  const [choice, setChoice] = useState<string>(next?.id ?? prev?.id ?? (others[0] ? OTHER : ''));
  const [other, setOther] = useState<string>(others[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ target?: string; note?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const targetId = choice === OTHER ? other : choice;
  const target = stages.find((s) => s.id === targetId);
  const move = target ? transitionFor(stages, student.stage.id, target.id) : null;
  const firstName = student.displayName.trim().split(/\s+/)[0] ?? '';
  const suggested = target
    ? templates.filter((t) => t.stageId === target.id && t.suggestOnStageEntry && t.isActive)
    : [];
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const previousOpen = openTasks.filter((t) => t.stageId === student.stage.id);
  const [closeOld, setCloseOld] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!target || !move) {
      setErrors({ target: 'مرحله‌ی جدید را انتخاب کن.' });
      return;
    }
    if (move.noteRequired && !note.trim()) {
      setErrors({
        note:
          move.kind === 'regress'
            ? 'برای برگشت به مرحله‌ی قبل، دلیلش را بنویس.'
            : 'برای پرش از چند مرحله، دلیلش را بنویس.',
      });
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    const body: ChangeStageInput = { toStageId: target.id, kind: move.kind };
    if (note.trim()) body.note = note.trim();
    // One atomic request (sprint-3 gap 4): the move, the suggested tasks and the cancellations
    // all happen, or none of them.
    const picks = suggested.filter((t) => !unchecked.has(t.id));
    if (picks.length) body.createTemplateIds = picks.map((t) => t.id);
    if (closeOld && previousOpen.length) {
      body.cancelTaskIds = previousOpen.map((t) => t.id);
      body.cancelReason = `مرحله به ${target.displayCode} ${target.name} تغییر کرد.`;
    }
    const result = await apiPut<ChangeStageResultDTO>(`/api/v1/students/${student.id}/stage`, body);
    if (result.ok) {
      setSubmitting(false);
      const made = result.data.createdTasks?.length ?? 0;
      const gone = result.data.cancelledTaskIds?.length ?? 0;
      onClose();
      toast.show({
        message: `${firstName} به مرحله‌ی ${target.displayCode} رفت.${made ? ` ${faNumber(made)} کار ساخته شد.` : ''}${gone ? ` ${faNumber(gone)} کار قبلی لغو شد.` : ''}`,
      });
      router.refresh();
      return;
    }
    setSubmitting(false);
    const { error } = result;
    if (error.fields.note) setErrors({ note: error.fields.note });
    else if (error.fields.createTemplateIds || error.fields.cancelTaskIds)
      setFormError(
        'یکی از کارهای پیشنهادی یا قبلی دیگر معتبر نیست؛ هیچ تغییری ثبت نشد. صفحه را تازه کن.',
      );
    else if (error.status === 409)
      setFormError('یکی از کارهای قبلی همین الان تمام یا لغو شد؛ هیچ تغییری ثبت نشد. دوباره بزن.');
    else if (error.fields.toStageId) setErrors({ target: error.fields.toStageId });
    else if (error.status === 404)
      setFormError('این هنرجو پیدا نشد؛ شاید به مشاور دیگری سپرده شده.');
    else setFormError(error.message);
  }

  const radio = (stage: PathStage, hint: ReactNode) => (
    <label
      key={stage.id}
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-2 rounded-sm border px-3 text-ui font-medium transition-colors',
        choice === stage.id
          ? 'border-primary bg-primary-weak font-semibold text-primary-text shadow-[inset_0_0_0_1px_var(--c-primary)]'
          : 'border-line-2 bg-surface hover:border-line-strong',
      )}
    >
      <input
        type="radio"
        name={groupId}
        value={stage.id}
        checked={choice === stage.id}
        onChange={() => setChoice(stage.id)}
        className="accent-primary"
      />
      {`${stage.displayCode} — ${stage.name}`}
      <span className="ms-auto">{hint}</span>
    </label>
  );

  return (
    <form noValidate onSubmit={onSubmit} aria-label={`تغییر مرحله‌ی ${student.displayName}`}>
      {formError ? <Alert tone="error" role="alert" title={formError} /> : null}
      <fieldset className="mb-5">
        <legend className="mb-1.5 text-ui font-semibold">مرحله‌ی جدید</legend>
        <div className="flex flex-col gap-2">
          {prev
            ? radio(prev, <span className="text-xs text-fg-3">برگشت؛ دلیل لازم است</span>)
            : null}
          <div
            aria-disabled="true"
            className="flex min-h-12 items-center gap-2 rounded-sm border border-line-2 px-3 text-ui font-medium opacity-65"
          >
            <input type="radio" disabled aria-label="مرحله‌ی فعلی" className="accent-primary" />
            {`${student.stage.displayCode} — ${student.stage.name}`}
            <Tag className="ms-auto">{`فعلی · ${faDays(student.daysInStage)}`}</Tag>
          </div>
          {next ? radio(next, <Tag variant="gate">بعدی</Tag>) : null}
          {others.length ? (
            <label
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-2 rounded-sm border px-3 text-ui font-medium',
                choice === OTHER
                  ? 'border-primary bg-primary-weak font-semibold text-primary-text shadow-[inset_0_0_0_1px_var(--c-primary)]'
                  : 'border-line-2 bg-surface hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name={groupId}
                value={OTHER}
                checked={choice === OTHER}
                onChange={() => setChoice(OTHER)}
                className="accent-primary"
              />
              مرحله‌ی دیگر…
            </label>
          ) : null}
        </div>
        {errors.target ? (
          <p role="alert" className="mt-1.5 text-sm font-semibold text-h-red-fg">
            {errors.target}
          </p>
        ) : null}
      </fieldset>
      {choice === OTHER ? (
        <SelectField label="کدام مرحله؟" value={other} onChange={(e) => setOther(e.target.value)}>
          {others.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.displayCode} — ${s.name}${index >= 0 && stages.indexOf(s) < index ? ' (برگشت)' : ''}`}
            </option>
          ))}
        </SelectField>
      ) : null}
      <TextareaField
        label={
          <>
            یادداشت{' '}
            <span className="font-normal text-fg-3">
              {move?.noteRequired ? '(لازم)' : '(اختیاری)'}
            </span>
          </>
        }
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={errors.note}
        className="min-h-[76px]"
        placeholder={move?.noteRequired ? 'چرا؟' : 'مثلاً: اولین دعوت به مصاحبه'}
      />
      {suggested.length ? (
        <fieldset className="mb-5">
          <legend className="mb-1.5 text-ui font-semibold">{`کارهای پیش‌فرض مرحله‌ی ${target?.displayCode ?? ''}`}</legend>
          {suggested.map((t) => (
            <CheckboxField
              key={t.id}
              className="mb-0"
              label={`${t.title}${t.defaultDueDays ? ` — مهلت ${faDays(t.defaultDueDays)}` : ''}`}
              checked={!unchecked.has(t.id)}
              onChange={(e) =>
                setUnchecked((u) => {
                  const n = new Set(u);
                  if (e.target.checked) n.delete(t.id);
                  else n.add(t.id);
                  return n;
                })
              }
            />
          ))}
        </fieldset>
      ) : null}
      {previousOpen.length ? (
        <Alert tone="warn" title="توجه:">
          {`${faNumber(previousOpen.length)} کار باز مرحله‌ی ${student.stage.displayCode} دارد (${previousOpen
            .slice(0, 2)
            .map((t) => `«${t.title}»`)
            .join('، ')}${previousOpen.length > 2 ? '، …' : ''}).`}
          <span className="mt-1.5 flex flex-wrap gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name={`${groupId}-old`}
                checked={!closeOld}
                onChange={() => setCloseOld(false)}
                className="accent-primary"
              />
              باز بماند
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name={`${groupId}-old`}
                checked={closeOld}
                onChange={() => setCloseOld(true)}
                className="accent-primary"
              />
              لغو شود
            </label>
          </span>
        </Alert>
      ) : null}
      <DialogActions>
        <Button onClick={onClose}>انصراف</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {target ? `ثبت مرحله‌ی ${target.displayCode}` : 'ثبت'}
        </Button>
      </DialogActions>
    </form>
  );
}

/** A button that opens the stage dialog for one student. */
export function ChangeStageButton({
  student,
  stages,
  label = 'تغییر مرحله',
  variant = 'secondary',
  className,
  templates,
  openTasks,
}: {
  student: StageMoveTarget;
  stages: readonly PathStage[];
  label?: string;
  variant?: 'primary' | 'secondary' | 'link' | 'ghost';
  className?: string;
  templates?: readonly SuggestedTemplate[];
  openTasks?: readonly OpenStageTask[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={variant === 'link' ? 'sm' : 'md'}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={className}
      >
        {label}
      </Button>
      <ChangeStageDialog
        student={student}
        stages={stages}
        open={open}
        onClose={() => setOpen(false)}
        templates={templates}
        openTasks={openTasks}
      />
    </>
  );
}
