'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import type { PickedStudent } from '@/components/students/student-picker';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { TaskTemplateDTO } from '@/modules/catalog/contracts';
import { type Option, TaskForm, type TaskFormResult } from './task-form';

export type NewTaskContext = {
  templates: TaskTemplateDTO[];
  stages: Option[];
  reviewers: Option[];
};

/** "New task" sheet; the form mounts fresh on every open. */
export function NewTaskDialog({
  open,
  onClose,
  context,
  student,
  defaultStageId,
  initialTitle,
  initialDescription,
  goToTask,
}: {
  open: boolean;
  onClose: () => void;
  context: NewTaskContext;
  /** Fixed student (record page). */
  student?: PickedStudent;
  defaultStageId?: string | null;
  initialTitle?: string;
  initialDescription?: string;
  /** After creating one task, open it (tasks page) instead of staying. */
  goToTask?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  function done(result: TaskFormResult, students: PickedStudent[]) {
    onClose();
    if (result.mode === 'single') {
      const first = students[0]?.displayName.trim().split(/\s+/)[0] ?? '';
      toast.show({ message: `کار «${result.task.title}» برای ${first} ساخته شد.` });
      if (goToTask) {
        router.push(`/tasks/${result.task.id}`);
        return;
      }
    } else {
      toast.show({ message: `${faNumber(result.created)} کار ساخته شد؛ برای هر هنرجو یکی.` });
    }
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={student ? `کار برای ${student.displayName}` : 'کار جدید'}
    >
      <TaskForm
        students={student ? [student] : []}
        lockStudent={Boolean(student)}
        templates={context.templates}
        stages={context.stages}
        reviewers={context.reviewers}
        defaultStageId={defaultStageId}
        initialTitle={initialTitle}
        initialDescription={initialDescription}
        onDone={done}
        onCancel={onClose}
      />
    </Dialog>
  );
}

/** Button + dialog. `initiallyOpen` follows `?new=1` (quick-add sheet, /tasks/new). */
export function NewTaskButton({
  context,
  student,
  defaultStageId,
  label = 'کار جدید',
  variant = 'primary',
  size,
  className,
  initiallyOpen,
  goToTask,
}: {
  context: NewTaskContext;
  student?: PickedStudent;
  defaultStageId?: string | null;
  label?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  className?: string;
  initiallyOpen?: boolean;
  goToTask?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(initiallyOpen));
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (initiallyOpen) setOpen(true);
  }, [initiallyOpen]);
  const close = () => {
    setOpen(false);
    // Drop `?new=1` so a refresh does not reopen the sheet.
    if (initiallyOpen) router.replace(pathname, { scroll: false });
  };
  return (
    <>
      <Button
        variant={variant}
        size={size}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={className}
      >
        <Icon name="plus" size={16} />
        {label}
      </Button>
      <NewTaskDialog
        open={open}
        onClose={close}
        context={context}
        student={student}
        defaultStageId={defaultStageId}
        goToTask={goToTask}
      />
    </>
  );
}
