'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '@/components/icons/icon';
import { NoteDialog } from '@/components/notes/note-dialog';
import type { PickedStudent } from '@/components/students/student-picker';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/dialog';

type QuickAddApi = {
  /** The student of the open record, if any ("Add for Amir Rostami"). */
  target: PickedStudent | null;
  setTarget: (s: PickedStudent | null) => void;
  open: () => void;
};

const QuickAddContext = createContext<QuickAddApi | null>(null);

export function useQuickAdd(): QuickAddApi | null {
  return useContext(QuickAddContext);
}

/** Holds the record's student and the quick-add sheet; mounted once by the staff shell. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PickedStudent | null>(null);
  const [sheet, setSheet] = useState(false);
  const [note, setNote] = useState(false);
  const api = useMemo(() => ({ target, setTarget, open: () => setSheet(true) }), [target]);
  return (
    <QuickAddContext.Provider value={api}>
      {children}
      <QuickAddSheet
        open={sheet}
        target={target}
        onClose={() => setSheet(false)}
        onNote={() => {
          setSheet(false);
          setNote(true);
        }}
      />
      <NoteDialog open={note} onClose={() => setNote(false)} student={target} />
    </QuickAddContext.Provider>
  );
}

/** Rendered by the record page: makes «+» preselect this student. */
export function QuickAddTarget({ student }: { student: PickedStudent }) {
  const ctx = useQuickAdd();
  const setTarget = ctx?.setTarget;
  const { id, displayName, stage } = student;
  useEffect(() => {
    setTarget?.({ id, displayName, stage });
    return () => setTarget?.(null);
  }, [setTarget, id, displayName, stage]);
  return null;
}

type Action = {
  key: string;
  label: string;
  sub?: string;
  icon: IconName;
  href?: string;
  primary?: boolean;
};

/**
 * "Quick add" (mockups/today.html #quick): note first (it opens right here, user-flows §5),
 * then task, reminder and — without a record — new student.
 */
function QuickAddSheet({
  open,
  target,
  onClose,
  onNote,
}: {
  open: boolean;
  target: PickedStudent | null;
  onClose: () => void;
  onNote: () => void;
}) {
  const t = useTranslations('quickAdd');
  const tShell = useTranslations('shell');
  const actions: Action[] = target
    ? [
        { key: 'note', label: t('note'), icon: 'pen', primary: true },
        { key: 'task', label: t('task'), icon: 'tasks', href: `/students/${target.id}?add=task` },
        {
          key: 'reminder',
          label: t('reminder'),
          icon: 'bell',
          href: `/students/${target.id}?add=reminder`,
        },
      ]
    : [
        { key: 'note', label: t('note'), sub: t('noteSub'), icon: 'pen', primary: true },
        {
          key: 'task',
          label: t('newTask'),
          sub: t('newTaskSub'),
          icon: 'tasks',
          href: '/tasks?new=1',
        },
        {
          key: 'reminder',
          label: t('reminder'),
          sub: t('reminderSub'),
          icon: 'bell',
          href: '/reminders?new=1',
        },
        {
          key: 'student',
          label: t('newStudent'),
          sub: t('newStudentSub'),
          icon: 'users',
          href: '/students/new',
        },
      ];
  const tile =
    'flex flex-col gap-2 rounded-md border border-line bg-surface p-4 text-start text-ui font-semibold text-fg hover:border-primary-line hover:bg-primary-weak cursor-pointer';
  const icon = (a: Action) => (
    <span
      className={cn(
        'grid size-9 place-items-center rounded-[10px]',
        a.primary ? 'bg-primary text-on-brand' : 'bg-surface-2 text-fg-2',
      )}
    >
      <Icon name={a.icon} />
    </span>
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={target ? t('titleFor', { name: target.displayName }) : tShell('quickAdd')}
      description={target ? t('descriptionFor') : t('description')}
    >
      <div className="grid grid-cols-2 gap-3">
        {actions.map((a) =>
          a.href ? (
            <Link key={a.key} href={a.href} onClick={onClose} className={tile}>
              {icon(a)}
              {a.label}
              {a.sub ? <small className="text-xs font-normal text-fg-3">{a.sub}</small> : null}
            </Link>
          ) : (
            <button key={a.key} type="button" onClick={onNote} className={tile}>
              {icon(a)}
              {a.label}
              {a.sub ? <small className="text-xs font-normal text-fg-3">{a.sub}</small> : null}
            </button>
          ),
        )}
      </div>
    </Dialog>
  );
}

/** Desktop "Add" in a page header (same sheet as the mobile "+"). */
export function QuickAddButton({ className }: { className?: string }) {
  const ctx = useQuickAdd();
  const t = useTranslations('shell');
  if (!ctx) return null;
  return (
    <Button aria-haspopup="dialog" onClick={ctx.open} className={className}>
      <Icon name="plus" size={16} />
      {t('add')}
    </Button>
  );
}
