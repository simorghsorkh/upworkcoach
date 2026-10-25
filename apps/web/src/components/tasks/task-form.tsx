'use client';

import { type FormEvent, useState } from 'react';
import { apiPost } from '@/components/api/client';
import { faNumber } from '@/components/format/fa';
import { addDaysTo, todayDay } from '@/components/format/jalali';
import { CheckboxField, splitApiError } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { type PickedStudent, StudentPicker } from '@/components/students/student-picker';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioCards } from '@/components/ui/choice';
import { DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { JalaliDateField } from '@/components/ui/jalali-date-field';
import { Alert } from '@/components/ui/states';
import type { SubmissionType, TaskTemplateDTO } from '@/modules/catalog/contracts';
import type {
  BulkTasksInput,
  BulkTasksResultDTO,
  CreateTaskInput,
  StaffTaskDTO,
} from '@/modules/tasks/contracts';
import { submissionTypeHint, submissionTypeLabel } from './labels';

export type Option = { id: string; label: string };

export type TaskFormResult =
  | { mode: 'single'; task: StaffTaskDTO }
  | { mode: 'bulk'; created: number; taskIds: string[] };

const TYPES: SubmissionType[] = [
  'text',
  'link',
  'file',
  'proposal_review',
  'profile_review',
  'checkbox',
];

const FIELDS = [
  'students',
  'title',
  'description',
  'submissionType',
  'dueDate',
  'stageId',
  'reviewerId',
  'form',
] as const;
type Field = (typeof FIELDS)[number];

const DEFAULT_DUE_DAYS = 3;

/**
 * M5a «کار جدید» (mockups/tasks.html #new-task, user-flows §4): one or several students
 * (a separate task each — bulk), optional template, verb-first title, description with the
 * acceptance criterion, submission type, Jalali deadline with shortcuts, and under «بیشتر»
 * the stage, gate, urgent and reviewer. Writes `POST /students/:id/tasks` or `POST /tasks/bulk`.
 */
export function TaskForm({
  students: initialStudents,
  lockStudent,
  templates,
  stages,
  reviewers,
  defaultStageId,
  initialTitle,
  initialDescription,
  onDone,
  onCancel,
}: {
  students: PickedStudent[];
  /** Opened from a record: the student is fixed. */
  lockStudent?: boolean;
  templates: TaskTemplateDTO[];
  stages: Option[];
  /** Admin: active mentors; empty = the field is hidden (default reviewer). */
  reviewers: Option[];
  defaultStageId?: string | null;
  initialTitle?: string;
  initialDescription?: string;
  onDone: (result: TaskFormResult, students: PickedStudent[]) => void;
  onCancel: () => void;
}) {
  const today = todayDay();
  const [students, setStudents] = useState<PickedStudent[]>(initialStudents);
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState(initialTitle ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [type, setType] = useState<SubmissionType>('text');
  const [dueDate, setDueDate] = useState(addDaysTo(today, DEFAULT_DUE_DAYS));
  const [stageId, setStageId] = useState(defaultStageId ?? '');
  const [gate, setGate] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.title);
    setDescription(t.description ?? '');
    setType(t.submissionType);
    setGate(t.requiredForGate);
    if (t.stageId) setStageId(t.stageId);
    if (t.defaultDueDays) setDueDate(addDaysTo(today, t.defaultDueDays));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const next: Partial<Record<Field, string>> = {};
    if (!students.length) next.students = 'دست‌کم یک هنرجو انتخاب کن.';
    if (!title.trim()) next.title = 'عنوان کار را وارد کن.';
    if (!dueDate) next.dueDate = 'مهلت را انتخاب کن.';
    else if (dueDate < today) next.dueDate = 'مهلت نباید گذشته باشد.';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const body: CreateTaskInput = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      submissionType: type,
      dueDate,
      stageId: stageId || null,
      requiredForGate: gate,
      priority: urgent ? 'urgent' : 'normal',
    };
    if (templateId) body.templateId = templateId;
    if (reviewerId) body.reviewerId = reviewerId;

    const single = students.length === 1 ? students[0] : undefined;
    let result: TaskFormResult | null = null;
    let error = null;
    if (single) {
      const res = await apiPost<StaffTaskDTO>(`/api/v1/students/${single.id}/tasks`, body);
      if (res.ok) result = { mode: 'single', task: res.data };
      else error = res.error;
    } else {
      const bulk: BulkTasksInput = { ...body, studentIds: students.map((s) => s.id) };
      const res = await apiPost<BulkTasksResultDTO>('/api/v1/tasks/bulk', bulk);
      if (res.ok) result = { mode: 'bulk', created: res.data.created, taskIds: res.data.taskIds };
      else error = res.error;
    }
    setSubmitting(false);
    if (result) {
      onDone(result, students);
      return;
    }
    if (!error) return;
    if (error.status === 404) {
      setErrors({ form: 'این هنرجو پیدا نشد؛ شاید به مشاور دیگری سپرده شده.' });
      return;
    }
    const split = splitApiError<Field>(error, FIELDS, { studentIds: 'students' });
    setErrors({ ...split.fields, ...(split.form ? { form: split.form } : {}) });
  }

  const byStage = new Map<string, TaskTemplateDTO[]>();
  for (const t of templates.filter((x) => x.isActive)) {
    const key = t.stageId ?? '';
    byStage.set(key, [...(byStage.get(key) ?? []), t]);
  }
  const stageLabel = (id: string) => stages.find((s) => s.id === id)?.label ?? 'بدون مرحله';

  return (
    <form noValidate onSubmit={onSubmit} aria-label="کار جدید">
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      {lockStudent && students[0] ? (
        <p className="mb-5 text-ui text-fg-2">
          برای <strong className="text-fg">{students[0].displayName}</strong>
        </p>
      ) : (
        <StudentPicker
          label="برای"
          multiple
          value={students}
          onChange={setStudents}
          error={errors.students}
          hint="چند هنرجو را هم می‌توانی انتخاب کنی؛ برای هر نفر یک کار جدا ساخته می‌شود."
        />
      )}
      {templates.length ? (
        <SelectField
          label="از قالب"
          optional
          value={templateId}
          onChange={(e) => applyTemplate(e.target.value)}
        >
          <option value="">— بدون قالب —</option>
          {[...byStage.entries()].map(([sid, list]) => (
            <optgroup key={sid || 'none'} label={sid ? stageLabel(sid) : 'عمومی'}>
              {list.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
      ) : null}
      <TextField
        label="عنوان"
        dir="auto"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        hint="با فعل شروع کن: «بازنویسی…»، «ارسال…»، «تکمیل…»"
        maxLength={200}
      />
      <TextareaField
        label={
          <span className="inline-flex flex-wrap items-center gap-2">
            شرح و معیار پذیرش
            <span className="font-normal text-fg-3">(اختیاری)</span>
            <Tag variant="gate" icon="eye">
              هنرجو این را می‌بیند
            </Tag>
          </span>
        }
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
        placeholder={'چه کاری؟ چرا؟\nوقتی قبول است که: …'}
      />
      <RadioCards
        legend="نوع"
        options={TYPES.map((t) => ({ value: t, label: submissionTypeLabel[t] }))}
        value={type}
        onChange={setType}
        error={errors.submissionType}
        hint={
          <>
            <Icon name="info" size={16} className="mt-0.5 flex-none" />
            <span>{submissionTypeHint[type]}</span>
          </>
        }
      />
      <JalaliDateField
        label="مهلت"
        value={dueDate}
        onChange={setDueDate}
        min={today}
        error={errors.dueDate}
      />
      <details className="group mb-4" open={Boolean(errors.stageId || errors.reviewerId)}>
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-ui font-semibold text-fg-2 hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden">
          بیشتر <span className="font-normal text-fg-3">(اختیاری)</span>
          <Icon name="chev-down" size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3">
          <SelectField
            label="مرحله‌ی مرتبط"
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            error={errors.stageId}
          >
            <option value="">هیچ</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === defaultStageId ? `${s.label} (فعلی)` : s.label}
              </option>
            ))}
          </SelectField>
          <CheckboxField
            label="اجباری برای عبور از مرحله"
            checked={gate}
            onChange={(e) => setGate(e.target.checked)}
            className="mb-1"
          />
          <CheckboxField
            label="فوری (به جاب یا پیشنهاد زنده وابسته است)"
            checked={urgent}
            onChange={(e) => setUrgent(e.target.checked)}
          />
          {reviewers.length ? (
            <SelectField
              label="بازبین"
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              error={errors.reviewerId}
            >
              <option value="">مشاور مسئول (پیش‌فرض)</option>
              {reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </SelectField>
          ) : null}
        </div>
      </details>
      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {students.length > 1 ? `ثبت ${faNumber(students.length)} کار` : 'ثبت کار'}
        </Button>
      </DialogActions>
    </form>
  );
}
