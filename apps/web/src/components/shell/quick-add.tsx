'use client';

import Link from 'next/link';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '@/components/icons/icon';
import { NoteDialog } from '@/components/notes/note-dialog';
import type { PickedStudent } from '@/components/students/student-picker';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/dialog';

type QuickAddApi = {
  /** The student of the open record, if any («افزودن برای امیر رستمی»). */
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
 * «افزودن سریع» (mockups/today.html #quick): note first (it opens right here, user-flows §5),
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
  const actions: Action[] = target
    ? [
        { key: 'note', label: 'یادداشت', icon: 'pen', primary: true },
        { key: 'task', label: 'کار', icon: 'tasks', href: `/students/${target.id}?add=task` },
        {
          key: 'reminder',
          label: 'یادآور',
          icon: 'bell',
          href: `/students/${target.id}?add=reminder`,
        },
      ]
    : [
        { key: 'note', label: 'یادداشت', sub: 'درباره‌ی یک هنرجو', icon: 'pen', primary: true },
        {
          key: 'task',
          label: 'کار جدید',
          sub: 'با مهلت شمسی',
          icon: 'tasks',
          href: '/tasks?new=1',
        },
        {
          key: 'reminder',
          label: 'یادآور',
          sub: 'برای خودت یا مشاور',
          icon: 'bell',
          href: '/reminders?new=1',
        },
        {
          key: 'student',
          label: 'هنرجوی جدید',
          sub: '+ لینک دعوت',
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
      title={target ? `افزودن برای ${target.displayName}` : 'افزودن سریع'}
      description={target ? 'هنرجو از پیش انتخاب شده است' : 'اول نام هنرجو را می‌پرسیم'}
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

/** Desktop «افزودن» in a page header (same sheet as the mobile «+»). */
export function QuickAddButton({ className }: { className?: string }) {
  const ctx = useQuickAdd();
  if (!ctx) return null;
  return (
    <Button aria-haspopup="dialog" onClick={ctx.open} className={className}>
      <Icon name="plus" size={16} />
      افزودن
    </Button>
  );
}
