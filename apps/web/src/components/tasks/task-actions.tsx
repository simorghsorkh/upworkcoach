'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPatch, apiPost } from '@/components/api/client';
import { faDayMonth, faNumber } from '@/components/format/fa';
import { addDaysTo, dayOf, todayDay } from '@/components/format/jalali';
import { CheckboxField } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { Tag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { TextareaField, TextField } from '@/components/ui/field';
import { JalaliDateField } from '@/components/ui/jalali-date-field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { StaffTaskDTO } from '@/modules/tasks/contracts';

export type ActionTask = Pick<
  StaffTaskDTO,
  'id' | 'title' | 'description' | 'priority' | 'dueAt' | 'extensionCount' | 'status' | 'updatedAt'
> & { studentFirstName: string };

type Panel = 'extend' | 'cancel' | 'edit' | 'menu' | null;

/**
 * M6 header actions (mockups/task-detail.html): "Extend deadline" with a reason and "Cancel task" with
 * a required reason. On mobile they sit in the "This task" sheet. Final tasks show nothing.
 */
export function TaskActions({
  task,
  layout = 'header',
  initialPanel,
}: {
  task: ActionTask;
  layout?: 'header' | 'menu';
  /** `?do=extend` from the tasks list opens the extend sheet directly. */
  initialPanel?: 'extend';
}) {
  const [panel, setPanel] = useState<Panel>(initialPanel ?? null);
  const close = () => setPanel(null);
  if (task.status === 'accepted' || task.status === 'cancelled') return null;
  return (
    <>
      {layout === 'header' ? (
        <>
          <Button variant="ghost" aria-haspopup="dialog" onClick={() => setPanel('edit')}>
            <Icon name="pen" size={16} />
            ویرایش شرح
          </Button>
          <Button aria-haspopup="dialog" onClick={() => setPanel('extend')}>
            <Icon name="calendar" size={16} />
            تمدید مهلت
          </Button>
          <Button variant="danger" aria-haspopup="dialog" onClick={() => setPanel('cancel')}>
            لغو کار
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          aria-haspopup="dialog"
          onClick={() => setPanel('menu')}
          aria-label="اقدام‌های این کار"
        >
          <Icon name="more" size={18} />
        </Button>
      )}
      <Dialog open={panel === 'menu'} onClose={close} title="این کار">
        <nav aria-label="اقدام‌های این کار" className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setPanel('extend')}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-sm px-3 text-start font-medium text-fg hover:bg-surface-2"
          >
            <Icon name="calendar" className="text-fg-3" />
            تمدید مهلت
          </button>
          <button
            type="button"
            onClick={() => setPanel('edit')}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-sm px-3 text-start font-medium text-fg hover:bg-surface-2"
          >
            <Icon name="pen" className="text-fg-3" />
            ویرایش شرح
          </button>
          <button
            type="button"
            onClick={() => setPanel('cancel')}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-sm px-3 text-start font-medium text-h-red-fg hover:bg-surface-2"
          >
            <Icon name="x" />
            لغو کار
          </button>
        </nav>
      </Dialog>
      <ExtendDialog task={task} open={panel === 'extend'} onClose={close} />
      <Dialog open={panel === 'edit'} onClose={close} title="ویرایش کار">
        <EditTaskForm task={task} onClose={close} />
      </Dialog>
      <CancelDialog task={task} open={panel === 'cancel'} onClose={close} />
    </>
  );
}

function ExtendDialog({
  task,
  open,
  onClose,
}: {
  task: ActionTask;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="تمدید مهلت"
      description={`مهلت فعلی: ${faDayMonth(new Date(task.dueAt))}${
        task.extensionCount ? ` · تاکنون ${faNumber(task.extensionCount)} بار تمدید شده` : ''
      }`}
    >
      <ExtendForm task={task} onClose={onClose} />
    </Dialog>
  );
}

function ExtendForm({ task, onClose }: { task: ActionTask; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const currentDay = dayOf(task.dueAt);
  const today = todayDay();
  const min = addDaysTo(currentDay > today ? currentDay : today, 1);
  const [day, setDay] = useState(addDaysTo(currentDay > today ? currentDay : today, 3));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ day?: string; reason?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const next: typeof errors = {};
    if (!day) next.day = 'مهلت جدید را انتخاب کن.';
    if (!reason.trim()) next.reason = 'دلیل تمدید را بنویس.';
    if (next.day || next.reason) {
      setErrors(next);
      return;
    }
    setSubmitting(true);
    const res = await apiPost<StaffTaskDTO>(`/api/v1/tasks/${task.id}/extend`, {
      newDueDate: day,
      reason: reason.trim(),
    });
    setSubmitting(false);
    if (res.ok) {
      onClose();
      toast.show({ message: `مهلت تا ${faDayMonth(new Date(res.data.dueAt))} تمدید شد.` });
      router.refresh();
      return;
    }
    const f = res.error.fields;
    setErrors({
      day: f.newDueDate,
      reason: f.reason,
      form: f.newDueDate || f.reason ? undefined : res.error.message,
    });
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      {task.extensionCount >= 2 ? (
        <Alert tone="info">سومین تمدید هشدار «نیاز به توجه» می‌دهد.</Alert>
      ) : null}
      <JalaliDateField
        label="مهلت جدید"
        value={day}
        onChange={setDay}
        min={min}
        error={errors.day}
      />
      <TextField
        label="دلیل"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={errors.reason}
        placeholder="مثلاً: کار بزرگ‌تر از انتظار بود"
        dir="auto"
      />
      <DialogActions>
        <Button onClick={onClose}>انصراف</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          تمدید
        </Button>
      </DialogActions>
    </form>
  );
}

function CancelDialog({
  task,
  open,
  onClose,
}: {
  task: ActionTask;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        <>
          لغو کار «<bdi>{task.title}</bdi>»؟
        </>
      }
    >
      <CancelForm task={task} onClose={onClose} />
    </Dialog>
  );
}

function CancelForm({ task, onClose }: { task: ActionTask; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!reason.trim()) {
      setError('دلیل لغو را بنویس.');
      return;
    }
    setSubmitting(true);
    const res = await apiPost<StaffTaskDTO>(`/api/v1/tasks/${task.id}/cancel`, {
      reason: reason.trim(),
    });
    setSubmitting(false);
    if (res.ok) {
      onClose();
      toast.show({ message: 'کار لغو شد.' });
      router.refresh();
      return;
    }
    if (res.error.fields.reason) setError(res.error.fields.reason);
    else setFormError(res.error.message);
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      {formError ? <Alert tone="error" role="alert" title={formError} /> : null}
      <p className="mb-4 text-sm text-fg-2">
        {`کار از فهرست ${task.studentFirstName} برداشته می‌شود و در تاریخچه با دلیل می‌ماند.`}
      </p>
      <TextField
        label="دلیل"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
        dir="auto"
      />
      <DialogActions>
        <Button onClick={onClose}>منصرف شدم</Button>
        <Button type="submit" variant="danger-solid" loading={submitting}>
          لغو کار
        </Button>
      </DialogActions>
    </form>
  );
}

function EditTaskForm({ task, onClose }: { task: ActionTask; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [urgent, setUrgent] = useState(task.priority === 'urgent');
  const [errors, setErrors] = useState<{ title?: string; description?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!title.trim()) {
      setErrors({ title: 'عنوان کار را وارد کن.' });
      return;
    }
    const body: Record<string, unknown> = { ifUpdatedAt: task.updatedAt };
    if (title.trim() !== task.title) body.title = title.trim();
    if ((description.trim() || null) !== task.description)
      body.description = description.trim() || null;
    if ((urgent ? 'urgent' : 'normal') !== task.priority)
      body.priority = urgent ? 'urgent' : 'normal';
    if (Object.keys(body).length === 1) {
      onClose();
      return;
    }
    setSubmitting(true);
    const res = await apiPatch<StaffTaskDTO>(`/api/v1/tasks/${task.id}`, body);
    setSubmitting(false);
    if (res.ok) {
      onClose();
      toast.show({ message: 'کار به‌روز شد.' });
      router.refresh();
      return;
    }
    const f = res.error.fields;
    setErrors({
      title: f.title,
      description: f.description,
      form:
        f.title || f.description
          ? undefined
          : res.error.status === 409
            ? 'کس دیگری زودتر این کار را تغییر داده؛ صفحه را تازه کن.'
            : res.error.message,
    });
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      {errors.form ? <Alert tone="error" role="alert" title={errors.form} /> : null}
      <TextField
        label="عنوان"
        dir="auto"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
      />
      <TextareaField
        label={
          <span className="inline-flex flex-wrap items-center gap-2">
            شرح و معیار پذیرش
            <Tag variant="gate" icon="eye">
              هنرجو این را می‌بیند
            </Tag>
          </span>
        }
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
      />
      <CheckboxField label="فوری" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
      <DialogActions>
        <Button onClick={onClose}>انصراف</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          ذخیره
        </Button>
      </DialogActions>
    </form>
  );
}
