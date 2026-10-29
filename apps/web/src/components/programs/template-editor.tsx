'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { apiDelete, apiPatch, apiPost, apiPut, apiRequest } from '@/components/api/client';
import { CheckboxField, splitApiError } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { PageHead } from '@/components/ui/page-head';
import { Alert, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { SubmissionType } from '@/modules/catalog/contracts';
import type { NodeDTO, PhaseDTO, TemplateDTO } from '@/modules/programs/contracts';
import type { NodeType } from '@/modules/programs/schema';
import { isolate, numberOrNull, TemplateStatusTags } from './program-bits';
import { NewRunButton } from './program-dialogs';

type MilestoneOption = { id: string; label: string };

type Editing =
  | { kind: 'details' }
  | { kind: 'duplicate' }
  | { kind: 'reject' }
  | { kind: 'node'; node: NodeDTO | null; parentId: string | null };

// Client code imports only types from the schema modules (no drizzle in the bundle).
const ACTIVITY_TYPES: NodeType[] = ['lesson', 'assignment', 'checklist', 'resource', 'milestone'];
const SUBMISSION_TYPES: SubmissionType[] = [
  'text',
  'link',
  'file',
  'proposal_review',
  'profile_review',
  'checkbox',
];

/**
 * Template editor (ADR-0012): details and package, phases with their activities (order, add,
 * edit, delete) and the life cycle — publish, archive/restore, duplicate, a mentor's
 * «send to organization» and the admin's approve/reject. Every change returns the whole
 * template, so the page shows exactly what the server stored.
 */
export function TemplateEditor({
  template: initial,
  isAdmin,
  canGroup = isAdmin,
  milestoneTypes = [],
}: {
  template: TemplateDTO;
  isAdmin: boolean;
  canGroup?: boolean;
  /** Active milestone types a milestone activity can wait for (sprint 5). */
  milestoneTypes?: MilestoneOption[];
}) {
  const t = useTranslations('programs');
  const router = useRouter();
  const toast = useToast();
  const [template, setTemplate] = useState(initial);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/program-templates/${template.id}`;
  const can = template.can;

  async function run(
    key: string,
    request: () => Promise<
      { ok: true; data: TemplateDTO } | { ok: false; error: { message: string } }
    >,
    message?: string,
  ) {
    setBusy(key);
    setError(null);
    const result = await request();
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setTemplate(result.data);
    if (message) toast.show({ message });
    router.refresh();
    return true;
  }

  const status = (action: 'publish' | 'archive' | 'restore', message: string) =>
    run(action, () => apiPost<TemplateDTO>(`${base}/${action}`), message);

  async function remove() {
    if (!window.confirm(t('confirmDeleteTemplate'))) return;
    setBusy('delete');
    setError(null);
    const result = await apiDelete(base);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.show({ message: t('toast.deleted') });
    router.push('/programs');
  }

  async function removeNode(node: NodeDTO) {
    if (!window.confirm(t('confirmDeleteNode', { title: isolate(node.title) }))) return;
    await run(
      node.id,
      () => apiRequest<TemplateDTO>('DELETE', `${base}/nodes/${node.id}`),
      t('toast.deleted'),
    );
  }

  function move(siblings: NodeDTO[], index: number, delta: -1 | 1, parentId: string | null) {
    const to = index + delta;
    if (to < 0 || to >= siblings.length) return;
    const ids = siblings.map((n) => n.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    void run(moved, () => apiPut<TemplateDTO>(`${base}/nodes/order`, { parentId, nodeIds: ids }));
  }

  const runnable = [{ id: template.id, title: template.title, kind: template.kind }];

  return (
    <>
      <PageHead
        eyebrow={
          <Link href="/programs" className="hover:text-link">
            {t('title')}
          </Link>
        }
        title={<bdi>{template.title}</bdi>}
        sub={
          <>
            <TemplateStatusTags
              status={template.status}
              visibility={template.visibility}
              isLegacy={template.isLegacy}
            />
            <span>{t(`kind.${template.kind}`)}</span>
            {template.status !== 'draft' ? (
              <span>{t('revision', { count: template.revision })}</span>
            ) : null}
            {template.owner ? (
              <span>{t('owner', { name: isolate(template.owner.displayName) })}</span>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {can.run ? (
              <NewRunButton
                isAdmin={isAdmin}
                canGroup={canGroup}
                templates={runnable}
                presetTemplateId={template.id}
                label={t('action.newRunFrom')}
              />
            ) : null}
            {can.edit && template.status === 'draft' ? (
              <Button
                variant="primary"
                loading={busy === 'publish'}
                onClick={() => status('publish', t('toast.published'))}
              >
                {t('action.publish')}
              </Button>
            ) : null}
            {can.submit ? (
              <Button
                variant="soft"
                loading={busy === 'submit'}
                onClick={() =>
                  run('submit', () => apiPost<TemplateDTO>(`${base}/submit`), t('toast.submitted'))
                }
              >
                {t('action.submit')}
              </Button>
            ) : null}
            {can.approve && template.visibility === 'pending_approval' ? (
              <>
                <Button
                  variant="primary"
                  loading={busy === 'approve'}
                  onClick={() =>
                    run(
                      'approve',
                      () => apiPost<TemplateDTO>(`${base}/approve`),
                      t('toast.approved'),
                    )
                  }
                >
                  {t('action.approve')}
                </Button>
                <Button variant="danger" onClick={() => setEditing({ kind: 'reject' })}>
                  {t('action.reject')}
                </Button>
              </>
            ) : null}
            <Button variant="secondary" onClick={() => setEditing({ kind: 'duplicate' })}>
              <Icon name="copy" size={16} />
              {t('action.duplicate')}
            </Button>
            {can.edit ? (
              <Button variant="secondary" onClick={() => setEditing({ kind: 'details' })}>
                <Icon name="pen" size={16} />
                {t('action.edit')}
              </Button>
            ) : null}
            {can.edit && template.status !== 'archived' && !template.isLegacy ? (
              <Button
                variant="ghost"
                loading={busy === 'archive'}
                onClick={() => status('archive', t('toast.archived'))}
              >
                {t('action.archive')}
              </Button>
            ) : null}
            {can.edit && template.status === 'archived' ? (
              <Button
                variant="secondary"
                loading={busy === 'restore'}
                onClick={() => status('restore', t('toast.restored'))}
              >
                {t('action.restore')}
              </Button>
            ) : null}
            {can.delete ? (
              <Button variant="danger" loading={busy === 'delete'} onClick={remove}>
                {t('action.delete')}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-col gap-4 md:gap-5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {template.isLegacy ? (
          <Alert
            tone="info"
            action={
              isAdmin ? (
                <Link href="/settings#stages" className="text-sm font-semibold">
                  {t('stageSettings')}
                </Link>
              ) : undefined
            }
          >
            {t('legacyTemplateNote')}
          </Alert>
        ) : null}
        {template.visibility === 'pending_approval' ? (
          <Alert tone="warn">{t('pendingNote')}</Alert>
        ) : null}
        {template.rejectionReason && template.visibility === 'private' ? (
          <Alert tone="error">
            {t('rejection', { reason: isolate(template.rejectionReason) })}
          </Alert>
        ) : null}

        <Card aria-labelledby="h-details">
          <CardHead title={t('details')} titleId="h-details" icon="info" />
          {template.description ? (
            <p className="mb-3 text-ui whitespace-pre-line text-fg-2">{template.description}</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {(
              [
                ['durationWeeks', template.durationWeeks, 'weeks'],
                ['sessionQuota', template.sessionQuota, 'sessions'],
                ['sessionMinutes', template.sessionMinutes, 'minutes'],
                ['validityDays', template.validityDays, 'days'],
              ] as const
            ).map(([field, value, unit]) => (
              <div key={field}>
                <dt className="text-fg-3">{t(`field.${field}`)}</dt>
                <dd className="font-semibold">
                  {value === null ? '—' : t(unit, { count: value })}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <section aria-labelledby="h-phases" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="h-phases" className="text-h2">
              {t('phases')}
            </h2>
            {can.edit ? (
              <Button
                variant="soft"
                onClick={() => setEditing({ kind: 'node', node: null, parentId: null })}
              >
                <Icon name="plus" size={16} />
                {t('action.addPhase')}
              </Button>
            ) : null}
          </div>
          {template.phases.length === 0 ? (
            <Card>
              <EmptyState icon="flag" tone="brand" title={t('noPhases')} />
            </Card>
          ) : (
            <ol className="flex flex-col gap-3">
              {template.phases.map((phase, index) => (
                <PhaseCard
                  key={phase.id}
                  phase={phase}
                  index={index}
                  count={template.phases.length}
                  editable={can.edit}
                  busy={busy}
                  milestoneTypes={milestoneTypes}
                  onEdit={(node) => setEditing({ kind: 'node', node, parentId: null })}
                  onAdd={() => setEditing({ kind: 'node', node: null, parentId: phase.id })}
                  onEditActivity={(node) => setEditing({ kind: 'node', node, parentId: phase.id })}
                  onDelete={removeNode}
                  onMovePhase={(delta) => move(template.phases, index, delta, null)}
                  onMoveActivity={(i, delta) => move(phase.activities, i, delta, phase.id)}
                />
              ))}
            </ol>
          )}
        </section>
      </div>

      {editing?.kind === 'details' ? (
        <DetailsDialog
          template={template}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setTemplate(saved);
            setEditing(null);
            toast.show({ message: t('toast.saved') });
            router.refresh();
          }}
        />
      ) : null}
      {editing?.kind === 'node' ? (
        <NodeDialog
          base={base}
          node={editing.node}
          parentId={editing.parentId}
          milestoneTypes={milestoneTypes}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setTemplate(saved);
            setEditing(null);
            toast.show({ message: t('toast.saved') });
            router.refresh();
          }}
        />
      ) : null}
      {editing?.kind === 'duplicate' ? (
        <TextDialog
          title={t('duplicateTitle', { title: isolate(template.title) })}
          label={t('field.title')}
          initial={t('copyOf', { title: template.title })}
          submitLabel={t('action.duplicate')}
          onClose={() => setEditing(null)}
          onSubmit={async (title) => {
            const result = await apiPost<TemplateDTO>(`${base}/duplicate`, { title });
            if (!result.ok) return result.error.message;
            toast.show({ message: t('toast.duplicated') });
            setEditing(null);
            router.push(`/programs/templates/${result.data.id}`);
            return null;
          }}
        />
      ) : null}
      {editing?.kind === 'reject' ? (
        <TextDialog
          title={t('rejectTitle', { title: isolate(template.title) })}
          label={t('field.reason')}
          initial=""
          multiline
          submitLabel={t('action.reject')}
          onClose={() => setEditing(null)}
          onSubmit={async (reason) => {
            const result = await apiPost<TemplateDTO>(`${base}/reject`, { reason });
            if (!result.ok) return result.error.message;
            setTemplate(result.data);
            toast.show({ message: t('toast.rejected') });
            setEditing(null);
            router.refresh();
            return null;
          }}
        />
      ) : null}
    </>
  );
}

function PhaseCard({
  phase,
  index,
  count,
  editable,
  busy,
  milestoneTypes,
  onEdit,
  onAdd,
  onEditActivity,
  onDelete,
  onMovePhase,
  onMoveActivity,
}: {
  phase: PhaseDTO;
  index: number;
  count: number;
  editable: boolean;
  busy: string | null;
  milestoneTypes: MilestoneOption[];
  onEdit: (node: NodeDTO) => void;
  onAdd: () => void;
  onEditActivity: (node: NodeDTO) => void;
  onDelete: (node: NodeDTO) => void;
  onMovePhase: (delta: -1 | 1) => void;
  onMoveActivity: (index: number, delta: -1 | 1) => void;
}) {
  const t = useTranslations('programs');
  return (
    <li>
      <Card aria-labelledby={`h-${phase.id}`}>
        <div className="mb-2 flex flex-wrap items-start gap-3">
          <span className="grid size-8 flex-none place-items-center rounded-full border-2 border-primary text-sm font-bold text-primary-text">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={`h-${phase.id}`} className="leading-8 font-bold">
              <bdi>{phase.title}</bdi>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg-2">
              {phase.isGate ? <Tag variant="gate">{t('gate')}</Tag> : null}
              {phase.isOpenEnded ? (
                <Tag>{t('openEnded')}</Tag>
              ) : phase.expectedDays ? (
                <Tag icon="clock">{t('expected', { count: phase.expectedDays })}</Tag>
              ) : null}
              <span>{t('activityCount', { count: phase.activities.length })}</span>
            </div>
          </div>
          {editable ? (
            <NodeTools
              node={phase}
              first={index === 0}
              last={index === count - 1}
              busy={busy === phase.id}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMovePhase}
            />
          ) : null}
        </div>
        {phase.body ? (
          <p className="ms-11 mb-2 text-sm whitespace-pre-line text-fg-2">{phase.body}</p>
        ) : null}
        {phase.activities.length ? (
          <ul className="ms-11 flex flex-col divide-y divide-line rounded-sm border border-line">
            {phase.activities.map((node, i) => (
              <li key={node.id} className="flex flex-wrap items-start gap-2 px-3 py-2">
                <Tag variant="outline" icon={null}>
                  {t(`nodeType.${node.nodeType}`)}
                </Tag>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <bdi>{node.title}</bdi>
                  </p>
                  {node.nodeType === 'assignment' && node.dueOffsetDays !== null ? (
                    <p className="text-sm text-fg-3">{t('due', { count: node.dueOffsetDays })}</p>
                  ) : null}
                  {node.nodeType === 'milestone' ? (
                    <p className="text-sm text-fg-3">
                      {node.milestoneTypeId
                        ? t('milestoneDoneWhen', {
                            name: isolate(
                              milestoneTypes.find((m) => m.id === node.milestoneTypeId)?.label ??
                                '',
                            ),
                          })
                        : t('milestoneManual')}
                    </p>
                  ) : null}
                  {node.checklistItems.length ? (
                    <ul className="mt-1 list-inside list-disc text-sm text-fg-2">
                      {node.checklistItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {editable ? (
                  <NodeTools
                    node={node}
                    first={i === 0}
                    last={i === phase.activities.length - 1}
                    busy={busy === node.id}
                    onEdit={onEditActivity}
                    onDelete={onDelete}
                    onMove={(delta) => onMoveActivity(i, delta)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ms-11 text-sm text-fg-3">{t('noActivities')}</p>
        )}
        {editable ? (
          <div className="ms-11 mt-2">
            <Button variant="link" size="sm" onClick={onAdd}>
              <Icon name="plus" size={14} />
              {t('action.addActivity')}
            </Button>
          </div>
        ) : null}
      </Card>
    </li>
  );
}

function NodeTools({
  node,
  first,
  last,
  busy,
  onEdit,
  onDelete,
  onMove,
}: {
  node: NodeDTO;
  first: boolean;
  last: boolean;
  busy: boolean;
  onEdit: (node: NodeDTO) => void;
  onDelete: (node: NodeDTO) => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const t = useTranslations('programs.action');
  const icon =
    'inline-grid size-tap place-items-center rounded-sm text-fg-2 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-35 md:size-8';
  return (
    <span className="flex flex-none items-center" aria-busy={busy || undefined}>
      <button
        type="button"
        className={icon}
        aria-label={t('moveUp')}
        disabled={first || busy}
        onClick={() => onMove(-1)}
      >
        <Icon name="chev-down" size={16} className="rotate-180" />
      </button>
      <button
        type="button"
        className={icon}
        aria-label={t('moveDown')}
        disabled={last || busy}
        onClick={() => onMove(1)}
      >
        <Icon name="chev-down" size={16} />
      </button>
      <button type="button" className={icon} aria-label={t('edit')} onClick={() => onEdit(node)}>
        <Icon name="pen" size={16} />
      </button>
      <button
        type="button"
        className={icon}
        aria-label={t('delete')}
        disabled={busy}
        onClick={() => onDelete(node)}
      >
        <Icon name="x" size={16} />
      </button>
    </span>
  );
}

const DETAIL_FIELDS = [
  'title',
  'description',
  'durationWeeks',
  'sessionQuota',
  'sessionMinutes',
  'validityDays',
] as const;
type DetailField = (typeof DETAIL_FIELDS)[number];

function DetailsDialog({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateDTO;
  onClose: () => void;
  onSaved: (template: TemplateDTO) => void;
}) {
  const t = useTranslations('programs');
  const tc = useTranslations('common');
  const text = (value: number | null) => (value === null ? '' : String(value));
  const [values, setValues] = useState<Record<DetailField, string>>({
    title: template.title,
    description: template.description ?? '',
    durationWeeks: text(template.durationWeeks),
    sessionQuota: text(template.sessionQuota),
    sessionMinutes: text(template.sessionMinutes),
    validityDays: text(template.validityDays),
  });
  const [errors, setErrors] = useState<Partial<Record<DetailField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: DetailField) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));
  const optional = (label: string) => t('optional', { label });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const result = await apiPatch<TemplateDTO>(`/api/v1/program-templates/${template.id}`, {
      title: values.title,
      description: values.description.trim() || null,
      durationWeeks: numberOrNull(values.durationWeeks),
      sessionQuota: numberOrNull(values.sessionQuota),
      sessionMinutes: numberOrNull(values.sessionMinutes),
      validityDays: numberOrNull(values.validityDays),
    });
    setBusy(false);
    if (!result.ok) {
      const split = splitApiError(result.error, DETAIL_FIELDS);
      setErrors(split.fields);
      setFormError(split.form);
      return;
    }
    onSaved(result.data);
  }

  return (
    <Dialog open onClose={onClose} title={t('details')}>
      <form onSubmit={submit} noValidate>
        {formError ? (
          <Alert tone="error" className="mb-4">
            {formError}
          </Alert>
        ) : null}
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
          {(['durationWeeks', 'validityDays', 'sessionQuota', 'sessionMinutes'] as const).map(
            (field) => (
              <TextField
                key={field}
                label={optional(t(`field.${field}`))}
                inputMode="numeric"
                value={values[field]}
                onChange={set(field)}
                error={errors[field]}
              />
            ),
          )}
        </div>
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

const NODE_FIELDS = [
  'title',
  'body',
  'expectedDays',
  'dueOffsetDays',
  'submissionType',
  'checklistItems',
  'milestoneTypeId',
] as const;
type NodeField = (typeof NODE_FIELDS)[number];

/** Add or edit a phase (no parent) or an activity inside `parentId`. */
function NodeDialog({
  base,
  node,
  parentId,
  milestoneTypes,
  onClose,
  onSaved,
}: {
  base: string;
  node: NodeDTO | null;
  parentId: string | null;
  milestoneTypes: MilestoneOption[];
  onClose: () => void;
  onSaved: (template: TemplateDTO) => void;
}) {
  const t = useTranslations('programs');
  const tc = useTranslations('common');
  const tTask = useTranslations('task');
  const isPhase = node ? node.nodeType === 'phase' : parentId === null;
  const [nodeType, setNodeType] = useState<NodeType>(
    node?.nodeType ?? (isPhase ? 'phase' : 'lesson'),
  );
  const [title, setTitle] = useState(node?.title ?? '');
  const [body, setBody] = useState(node?.body ?? '');
  const [expectedDays, setExpectedDays] = useState(
    node?.expectedDays === null || node?.expectedDays === undefined
      ? ''
      : String(node.expectedDays),
  );
  const [isOpenEnded, setOpenEnded] = useState(node?.isOpenEnded ?? false);
  const [isGate, setGate] = useState(node?.isGate ?? false);
  const [isRequired, setRequired] = useState(node?.isRequired ?? true);
  const [dueOffsetDays, setDue] = useState(
    node?.dueOffsetDays === null || node?.dueOffsetDays === undefined
      ? ''
      : String(node.dueOffsetDays),
  );
  const [submissionType, setSubmissionType] = useState<string>(node?.submissionType ?? 'text');
  const [checklist, setChecklist] = useState((node?.checklistItems ?? []).join('\n'));
  const [milestoneTypeId, setMilestoneTypeId] = useState(node?.milestoneTypeId ?? '');
  const [errors, setErrors] = useState<Partial<Record<NodeField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const optional = (label: string) => t('optional', { label });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const fields = {
      title,
      body: body.trim() || null,
      ...(isPhase
        ? { expectedDays: isOpenEnded ? null : numberOrNull(expectedDays), isOpenEnded, isGate }
        : {
            isRequired,
            dueOffsetDays: nodeType === 'assignment' ? numberOrNull(dueOffsetDays) : null,
            submissionType: nodeType === 'assignment' ? submissionType : null,
            checklistItems:
              nodeType === 'checklist'
                ? checklist
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                : [],
            milestoneTypeId: nodeType === 'milestone' && milestoneTypeId ? milestoneTypeId : null,
          }),
    };
    const result = node
      ? await apiPatch<TemplateDTO>(`${base}/nodes/${node.id}`, fields)
      : await apiPost<TemplateDTO>(`${base}/nodes`, { ...fields, nodeType, parentId });
    setBusy(false);
    if (!result.ok) {
      const split = splitApiError(result.error, NODE_FIELDS);
      setErrors(split.fields);
      setFormError(split.form);
      return;
    }
    onSaved(result.data);
  }

  const heading = node
    ? t('action.edit')
    : isPhase
      ? t('action.addPhase')
      : t('action.addActivity');
  return (
    <Dialog open onClose={onClose} title={heading}>
      <form onSubmit={submit} noValidate>
        {formError ? (
          <Alert tone="error" className="mb-4">
            {formError}
          </Alert>
        ) : null}
        {!isPhase && !node ? (
          <SelectField
            label={t('field.nodeType')}
            value={nodeType}
            onChange={(e) => setNodeType(e.target.value as NodeType)}
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`nodeType.${type}`)}
              </option>
            ))}
          </SelectField>
        ) : null}
        <TextField
          label={t('field.title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          maxLength={200}
          required
        />
        <TextareaField
          label={optional(t('field.body'))}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          error={errors.body}
          rows={4}
        />
        {isPhase ? (
          <>
            <CheckboxField
              label={t('field.isOpenEnded')}
              checked={isOpenEnded}
              onChange={(e) => setOpenEnded(e.target.checked)}
            />
            {!isOpenEnded ? (
              <TextField
                label={optional(t('field.expectedDays'))}
                inputMode="numeric"
                value={expectedDays}
                onChange={(e) => setExpectedDays(e.target.value)}
                error={errors.expectedDays}
              />
            ) : null}
            <CheckboxField
              label={t('field.isGate')}
              checked={isGate}
              onChange={(e) => setGate(e.target.checked)}
            />
          </>
        ) : (
          <>
            {nodeType === 'assignment' ? (
              <div className="grid gap-x-4 sm:grid-cols-2">
                <SelectField
                  label={t('field.submissionType')}
                  value={submissionType}
                  onChange={(e) => setSubmissionType(e.target.value)}
                  error={errors.submissionType}
                >
                  {SUBMISSION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tTask(`submissionType.${type}`)}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label={optional(t('field.dueOffsetDays'))}
                  inputMode="numeric"
                  value={dueOffsetDays}
                  onChange={(e) => setDue(e.target.value)}
                  error={errors.dueOffsetDays}
                />
              </div>
            ) : null}
            {nodeType === 'milestone' ? (
              <SelectField
                label={t('field.milestoneType')}
                hint={t('field.milestoneTypeHint')}
                value={milestoneTypeId}
                onChange={(e) => setMilestoneTypeId(e.target.value)}
                error={errors.milestoneTypeId}
              >
                <option value="">{t('field.milestoneTypeNone')}</option>
                {milestoneTypes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </SelectField>
            ) : null}
            {nodeType === 'checklist' ? (
              <TextareaField
                label={t('field.checklistItems')}
                value={checklist}
                onChange={(e) => setChecklist(e.target.value)}
                error={errors.checklistItems}
                rows={5}
              />
            ) : null}
            <CheckboxField
              label={t('field.isRequired')}
              checked={isRequired}
              onChange={(e) => setRequired(e.target.checked)}
            />
          </>
        )}
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

/** One-field dialog (duplicate title, rejection reason); `onSubmit` returns an error or null. */
export function TextDialog({
  title,
  label,
  initial,
  multiline,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  initial: string;
  multiline?: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<string | null>;
}) {
  const tc = useTranslations('common');
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await onSubmit(value);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Dialog open onClose={onClose} title={title}>
      <form onSubmit={submit} noValidate>
        {multiline ? (
          <TextareaField
            label={label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={error}
            rows={4}
            required
          />
        ) : (
          <TextField
            label={label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={error}
            maxLength={160}
            required
          />
        )}
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
