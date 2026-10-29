'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { splitApiError } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { RunDTO, TemplateDTO } from '@/modules/programs/contracts';
import type { ProgramKind, RunMode } from '@/modules/programs/schema';
import { DayField, numberOrNull } from './program-bits';

const TEMPLATE_FIELDS = [
  'title',
  'description',
  'durationWeeks',
  'sessionQuota',
  'sessionMinutes',
  'validityDays',
] as const;
type TemplateField = (typeof TEMPLATE_FIELDS)[number];

/** «قالب جدید»: kind and title (plus the package of a one-on-one); opens the editor. */
export function NewTemplateButton({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('programs');
  const tc = useTranslations('common');
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ProgramKind>('program');
  const [values, setValues] = useState<Record<TemplateField, string>>({
    title: '',
    description: '',
    durationWeeks: '',
    sessionQuota: '',
    sessionMinutes: '',
    validityDays: '',
  });
  const [errors, setErrors] = useState<Partial<Record<TemplateField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: TemplateField) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const result = await apiPost<TemplateDTO>('/api/v1/program-templates', {
      kind,
      title: values.title,
      description: values.description.trim() || null,
      durationWeeks: numberOrNull(values.durationWeeks),
      sessionQuota: numberOrNull(values.sessionQuota),
      sessionMinutes: numberOrNull(values.sessionMinutes),
      validityDays: numberOrNull(values.validityDays),
    });
    setBusy(false);
    if (!result.ok) {
      const split = splitApiError(result.error, TEMPLATE_FIELDS);
      setErrors(split.fields);
      setFormError(split.form);
      return;
    }
    toast.show({ message: t('toast.templateCreated') });
    setOpen(false);
    router.push(`/programs/templates/${result.data.id}`);
  }

  const optional = (label: string) => t('optional', { label });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} />
        {t('newTemplate')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('newTemplate')}
        description={isAdmin ? undefined : t('mentorTemplateHint')}
      >
        <form onSubmit={submit} noValidate>
          {formError ? (
            <Alert tone="error" className="mb-4">
              {formError}
            </Alert>
          ) : null}
          <SelectField
            label={t('field.kind')}
            value={kind}
            onChange={(e) => setKind(e.target.value as ProgramKind)}
          >
            <option value="program">{t('kind.program')}</option>
            <option value="one_on_one">{t('kind.one_on_one')}</option>
          </SelectField>
          <TextField
            label={t('field.title')}
            value={values.title}
            onChange={set('title')}
            error={errors.title}
            maxLength={160}
            required
          />
          <TextareaField
            label={optional(t('field.description'))}
            value={values.description}
            onChange={set('description')}
            error={errors.description}
            rows={3}
          />
          <div className="grid gap-x-4 sm:grid-cols-2">
            <TextField
              label={optional(t('field.durationWeeks'))}
              inputMode="numeric"
              value={values.durationWeeks}
              onChange={set('durationWeeks')}
              error={errors.durationWeeks}
            />
            <TextField
              label={optional(t('field.validityDays'))}
              inputMode="numeric"
              value={values.validityDays}
              onChange={set('validityDays')}
              error={errors.validityDays}
            />
            <TextField
              label={optional(t('field.sessionQuota'))}
              inputMode="numeric"
              value={values.sessionQuota}
              onChange={set('sessionQuota')}
              error={errors.sessionQuota}
            />
            <TextField
              label={optional(t('field.sessionMinutes'))}
              inputMode="numeric"
              value={values.sessionMinutes}
              onChange={set('sessionMinutes')}
              error={errors.sessionMinutes}
            />
          </div>
          <DialogActions>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {t('action.create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

export type RunnableTemplate = { id: string; title: string; kind: ProgramKind };

const RUN_FIELDS = ['templateId', 'title', 'mode', 'startsOn', 'endsOn'] as const;
type RunField = (typeof RUN_FIELDS)[number];

/** «اجرای جدید»: from a published template (snapshot), or a one-on-one without one. */
export function NewRunButton({
  isAdmin,
  canGroup = isAdmin,
  templates,
  presetTemplateId,
  label,
  variant = 'primary',
}: {
  isAdmin: boolean;
  /** The admin, or a mentor when the organization lets mentors start group runs. */
  canGroup?: boolean;
  templates: RunnableTemplate[];
  presetTemplateId?: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'soft';
}) {
  const t = useTranslations('programs');
  const tc = useTranslations('common');
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(presetTemplateId ?? templates[0]?.id ?? '');
  const [mode, setMode] = useState<RunMode>(canGroup ? 'group' : 'individual');
  const [title, setTitle] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [errors, setErrors] = useState<Partial<Record<RunField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const oneOnOne = templateId === '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const result = await apiPost<RunDTO>('/api/v1/program-runs', {
      ...(oneOnOne ? { kind: 'one_on_one' } : { templateId }),
      mode: oneOnOne ? 'individual' : mode,
      title,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
    });
    setBusy(false);
    if (!result.ok) {
      const split = splitApiError(result.error, RUN_FIELDS);
      setErrors(split.fields);
      setFormError(split.form);
      return;
    }
    toast.show({ message: t('toast.runCreated') });
    setOpen(false);
    router.push(`/programs/runs/${result.data.id}`);
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} />
        {label ?? t('newRun')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('newRun')}
        description={canGroup ? undefined : t('mentorRunHint')}
      >
        <form onSubmit={submit} noValidate>
          {formError ? (
            <Alert tone="error" className="mb-4">
              {formError}
            </Alert>
          ) : null}
          <SelectField
            label={t('field.template')}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            error={errors.templateId}
            hint={oneOnOne ? t('oneOnOneHint') : t('templateHint')}
          >
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.title}
              </option>
            ))}
            <option value="">{t('kind.one_on_one')}</option>
          </SelectField>
          {canGroup && !oneOnOne ? (
            <SelectField
              label={t('field.mode')}
              value={mode}
              onChange={(e) => setMode(e.target.value as RunMode)}
              error={errors.mode}
            >
              <option value="group">{t('mode.group')}</option>
              <option value="individual">{t('mode.individual')}</option>
            </SelectField>
          ) : null}
          <TextField
            label={t('field.title')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
            maxLength={160}
            required
          />
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
          <DialogActions>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {t('action.create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
