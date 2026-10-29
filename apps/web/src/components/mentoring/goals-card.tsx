'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { apiPatch, apiPost } from '@/components/api/client';
import { useFormat } from '@/components/format/use-format';
import { Icon } from '@/components/icons/icon';
import { DayField, dayDate } from '@/components/programs/program-bits';
import { Tag, type TagVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { GoalDTO } from '@/modules/mentoring/contracts';
import type { GoalStatus } from '@/modules/mentoring/schema';

const GOAL_TAG: Record<GoalStatus, TagVariant> = {
  open: 'outline',
  achieved: 'gate',
  dropped: 'neutral',
};

export function GoalStatusTag({ status }: { status: GoalStatus }) {
  const t = useTranslations('mentoring.goals.status');
  return (
    <Tag variant={GOAL_TAG[status]} icon={status === 'achieved' ? 'check' : null}>
      {t(status)}
    </Tag>
  );
}

/** Goals as a read-only list (the mentee's view). */
export function GoalList({ goals }: { goals: GoalDTO[] }) {
  const t = useTranslations('mentoring.goals');
  const format = useFormat();
  if (!goals.length) return <p className="text-sm text-fg-3">{t('none')}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {goals.map((g) => (
        <li key={g.id} className="flex flex-wrap items-center gap-2">
          <Icon
            name={g.status === 'achieved' ? 'check-circle' : 'target'}
            size={16}
            className={g.status === 'achieved' ? 'text-h-green-fg' : 'text-fg-3'}
          />
          <bdi className={cn('font-medium', g.status === 'dropped' && 'text-fg-3 line-through')}>
            {g.title}
          </bdi>
          <GoalStatusTag status={g.status} />
          {g.targetDate ? (
            <span className="text-xs text-fg-3">
              {t('targetBy', { date: format.date(dayDate(g.targetDate)) })}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Goals of a one-on-one enrollment (ADR-0012 §6, sprint 5b). Staff add goals and mark them
 * achieved or dropped; the enrollment's progress is achieved ÷ not dropped.
 */
export function GoalsCard({
  enrollmentId,
  title,
  initial,
  canEdit,
}: {
  enrollmentId: string;
  title: string;
  initial: GoalDTO[];
  canEdit: boolean;
}) {
  const t = useTranslations('mentoring.goals');
  const format = useFormat();
  const router = useRouter();
  const toast = useToast();
  const [goals, setGoals] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headId = `h-goals-${enrollmentId}`;

  async function setStatus(goal: GoalDTO, status: GoalStatus) {
    setBusy(goal.id);
    setError(null);
    const result = await apiPatch<GoalDTO>(`/api/v1/goals/${goal.id}`, { status });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setGoals((list) => list.map((g) => (g.id === goal.id ? result.data : g)));
    toast.show({ message: t('toast.updated') });
    router.refresh();
  }

  return (
    <Card aria-labelledby={headId}>
      <CardHead
        title={title}
        titleId={headId}
        icon="target"
        count={goals.length || undefined}
        sub={t('progressHint')}
        actions={
          canEdit ? (
            <Button size="sm" variant="soft" onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} />
              {t('add')}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <Alert tone="error" className="mb-2">
          {error}
        </Alert>
      ) : null}
      {goals.length === 0 ? (
        <p className="text-sm text-fg-3">{t('none')}</p>
      ) : (
        <ul className="-mx-4 md:-mx-5">
          {goals.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-2.5 first:border-t-0 md:px-5"
            >
              <div className="min-w-0 flex-1 basis-48">
                <bdi
                  className={cn(
                    'font-semibold',
                    g.status === 'dropped' && 'text-fg-3 line-through',
                  )}
                >
                  {g.title}
                </bdi>
                {g.description ? (
                  <p className="text-sm whitespace-pre-line text-fg-2">{g.description}</p>
                ) : null}
                {g.targetDate ? (
                  <p className="text-xs text-fg-3">
                    {t('targetBy', { date: format.date(dayDate(g.targetDate)) })}
                  </p>
                ) : null}
              </div>
              <GoalStatusTag status={g.status} />
              {canEdit ? (
                <div className="flex flex-wrap gap-1.5">
                  {g.status === 'open' ? (
                    <>
                      <Button
                        size="sm"
                        variant="soft"
                        loading={busy === g.id}
                        onClick={() => setStatus(g, 'achieved')}
                      >
                        <Icon name="check" size={14} />
                        {t('action.achieve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === g.id}
                        onClick={() => setStatus(g, 'dropped')}
                      >
                        {t('action.drop')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === g.id}
                      onClick={() => setStatus(g, 'open')}
                    >
                      {t('action.reopen')}
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <GoalDialog
          enrollmentId={enrollmentId}
          onClose={() => setAdding(false)}
          onSaved={(goal) => {
            setGoals((list) => [...list, goal]);
            setAdding(false);
            toast.show({ message: t('toast.added') });
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function GoalDialog({
  enrollmentId,
  onClose,
  onSaved,
}: {
  enrollmentId: string;
  onClose: () => void;
  onSaved: (goal: GoalDTO) => void;
}) {
  const t = useTranslations('mentoring.goals');
  const tc = useTranslations('common');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const result = await apiPost<GoalDTO>(`/api/v1/enrollments/${enrollmentId}/goals`, {
      title,
      description: description.trim() || null,
      targetDate: target || null,
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
    <Dialog open onClose={onClose} title={t('add')}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {errors.form ? <Alert tone="error">{errors.form}</Alert> : null}
        <TextField
          label={t('field.title')}
          value={title}
          error={errors.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextareaField
          label={t('field.description')}
          optional
          rows={3}
          value={description}
          error={errors.description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <DayField
          label={t('field.targetDate')}
          value={target}
          onChange={setTarget}
          error={errors.targetDate}
        />
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('add')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
