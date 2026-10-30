'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { apiPost, apiPut } from '@/components/api/client';
import { FlagDialog, SnoozeDialog } from '@/components/health/health-dialogs';
import { Icon, type IconName } from '@/components/icons/icon';
import { MilestoneForm } from '@/components/milestones/milestone-form';
import { NoteDialog } from '@/components/notes/note-dialog';
import { ReminderDialog } from '@/components/reminders/reminder-form';
import {
  ChangeStageDialog,
  type OpenStageTask,
  type PathStage,
  type SuggestedTemplate,
} from '@/components/stages/change-stage-dialog';
import { type NewTaskContext, NewTaskDialog } from '@/components/tasks/new-task-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { MilestoneTypeDTO } from '@/modules/catalog/contracts';
import type { MentorOptionDTO } from '@/modules/identity/contracts';
import type { StaffStudentDTO } from '@/modules/students/contracts';
import { LifecycleDialog } from './lifecycle-dialog';
import { InviteReady, type NewStudentResult } from './new-student-form';

type Panel =
  | 'menu'
  | 'stage'
  | 'mentor'
  | 'invite'
  | 'note'
  | 'task'
  | 'reminder'
  | 'snooze'
  | 'flag'
  | 'pause'
  | 'milestone'
  | null;
export type AddPanel = 'note' | 'task' | 'reminder' | 'stage';

/**
 * M3 actions (mockups/student-profile.html): header "Note" (primary), "Task", "Reminder" and
 * "More" (stage change, "Mute alert until a date…", pause with a return day, manual flag,
 * milestone, mentor change for admins, a fresh invite link); the fixed mobile bar
 * has "Note", "Task" and "Stage". `initial` (`?add=note|task|reminder`, from "Today" and the
 * quick-add sheet) opens one of them on arrival.
 */
export function StudentActions({
  student,
  stages,
  mentors,
  isAdmin,
  viewerId,
  taskContext,
  templates = [],
  openTasks = [],
  initial,
  milestones,
}: {
  student: StaffStudentDTO;
  stages: readonly PathStage[];
  mentors: MentorOptionDTO[];
  isAdmin: boolean;
  viewerId: string;
  taskContext: NewTaskContext;
  templates?: readonly SuggestedTemplate[];
  openTasks?: readonly OpenStageTask[];
  initial?: AddPanel;
  /** Milestone types and platforms for "Record milestone". */
  milestones?: { types: MilestoneTypeDTO[]; platforms: Array<{ id: string; name: string }> };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>(initial ?? null);
  const firstName = student.displayName.trim().split(/\s+/)[0] ?? student.displayName;
  const tracked = student.lifecycleStatus === 'active' || student.lifecycleStatus === 'paused';
  const [taskDraft, setTaskDraft] = useState<{ title: string; description: string } | null>(null);
  const close = () => {
    setPanel(null);
    setTaskDraft(null);
    if (initial) router.replace(pathname, { scroll: false });
  };
  const target = {
    id: student.id,
    displayName: student.displayName,
    stage: student.stage,
    daysInStage: student.daysInStage,
  };
  const picked = {
    id: student.id,
    displayName: student.displayName,
    stage: `مرحله‌ی ${student.stage.displayCode}`,
  };
  const owners = isAdmin ? mentors.map((m) => ({ id: m.id, label: m.displayName })) : [];

  const bar =
    'fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t border-line bg-surface/95 px-3 py-2 backdrop-blur-md md:hidden';

  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <Button variant="primary" aria-haspopup="dialog" onClick={() => setPanel('note')}>
          <Icon name="pen" size={16} />
          یادداشت
        </Button>
        <Button aria-haspopup="dialog" onClick={() => setPanel('task')}>
          <Icon name="tasks" size={16} />
          کار
        </Button>
        <Button aria-haspopup="dialog" onClick={() => setPanel('reminder')}>
          <Icon name="bell" size={16} />
          یادآور
        </Button>
        <Button aria-haspopup="dialog" onClick={() => setPanel('menu')}>
          <Icon name="more" size={16} />
          بیشتر
        </Button>
      </div>
      {/* Mobile: fixed quick actions above the tab bar (mockups `.action-bar`). */}
      <div role="toolbar" aria-label="اقدام سریع" className={bar}>
        <Button
          variant="primary"
          aria-haspopup="dialog"
          onClick={() => setPanel('note')}
          className="flex-1"
        >
          <Icon name="pen" size={16} />
          یادداشت
        </Button>
        <Button aria-haspopup="dialog" onClick={() => setPanel('task')} className="flex-1">
          <Icon name="tasks" size={16} />
          کار
        </Button>
        <Button aria-haspopup="dialog" onClick={() => setPanel('stage')} className="flex-1">
          <Icon name="route" size={16} />
          مرحله
        </Button>
        <Button
          aria-haspopup="dialog"
          onClick={() => setPanel('menu')}
          aria-label="بیشتر"
          className="flex-none px-3"
        >
          <Icon name="more" size={16} />
        </Button>
      </div>

      <NoteDialog
        open={panel === 'note'}
        onClose={close}
        student={picked}
        onCreateTask={(_s, title, description) => {
          setTaskDraft({ title, description });
          setPanel('task');
        }}
      />
      <NewTaskDialog
        open={panel === 'task'}
        onClose={close}
        context={taskContext}
        student={picked}
        defaultStageId={student.stage.id}
        initialTitle={taskDraft?.title}
        initialDescription={taskDraft?.description}
      />
      <ReminderDialog
        open={panel === 'reminder'}
        onClose={close}
        student={picked}
        owners={owners}
        viewerId={viewerId}
      />
      <ChangeStageDialog
        student={target}
        stages={stages}
        open={panel === 'stage'}
        onClose={close}
        templates={templates}
        openTasks={openTasks}
      />

      <Dialog open={panel === 'menu'} onClose={close} title="اقدام‌های دیگر">
        <nav aria-label="اقدام‌های دیگر" className="flex flex-col gap-0.5">
          <MenuButton icon="route" onClick={() => setPanel('stage')}>
            تغییر مرحله
          </MenuButton>
          <MenuButton icon="bell" onClick={() => setPanel('reminder')}>
            یادآور
          </MenuButton>
          {student.lifecycleStatus === 'active' ? (
            <MenuButton
              icon="bell-off"
              sub={student.health?.snoozedUntil ? 'الان خاموش است' : undefined}
              onClick={() => setPanel('snooze')}
            >
              خاموش کردن هشدار تا تاریخ…
            </MenuButton>
          ) : null}
          {tracked ? (
            <MenuButton icon="pause" onClick={() => setPanel('pause')}>
              {student.lifecycleStatus === 'paused'
                ? 'بازگشت به فعال'
                : 'توقف موقت (با تاریخ بازگشت)'}
            </MenuButton>
          ) : null}
          <MenuButton icon="flag" sub="مالی، شخصی، دسترسی…" onClick={() => setPanel('flag')}>
            پرچم دستی
          </MenuButton>
          {milestones ? (
            <MenuButton icon="award" onClick={() => setPanel('milestone')}>
              ثبت نقطه‌ی عطف
            </MenuButton>
          ) : null}
          {isAdmin ? (
            <MenuButton icon="users" sub="مدیر" onClick={() => setPanel('mentor')}>
              تغییر مشاور
            </MenuButton>
          ) : null}
          {student.accountStatus === 'invited' ? (
            <MenuButton icon="refresh" onClick={() => setPanel('invite')}>
              ارسال دوباره‌ی لینک دعوت
            </MenuButton>
          ) : null}
        </nav>
      </Dialog>

      <SnoozeDialog
        studentId={student.id}
        firstName={firstName}
        snoozedUntil={student.health?.snoozedUntil ?? null}
        open={panel === 'snooze'}
        onClose={close}
      />
      <FlagDialog
        studentId={student.id}
        firstName={firstName}
        open={panel === 'flag'}
        onClose={close}
      />
      {tracked ? (
        <LifecycleDialog
          studentId={student.id}
          firstName={firstName}
          status={student.lifecycleStatus}
          pausedUntil={student.pausedUntil}
          open={panel === 'pause'}
          onClose={close}
        />
      ) : null}
      {milestones ? (
        <Dialog open={panel === 'milestone'} onClose={close} title={`نقطه‌ی عطف برای ${firstName}`}>
          <MilestoneForm
            mode="staff"
            studentId={student.id}
            types={milestones.types}
            platforms={milestones.platforms}
            onCancel={close}
            onDone={() => {
              close();
              toast.show({ message: 'نقطه‌ی عطف ثبت شد.' });
              router.refresh();
            }}
          />
        </Dialog>
      ) : null}

      {isAdmin ? (
        <ChangeMentorDialog
          student={student}
          mentors={mentors}
          open={panel === 'mentor'}
          onClose={close}
        />
      ) : null}
      {student.accountStatus === 'invited' ? (
        <ReinviteDialog student={student} open={panel === 'invite'} onClose={close} />
      ) : null}
    </>
  );
}

function MenuButton({
  icon,
  sub,
  onClick,
  children,
}: {
  icon: IconName;
  sub?: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-sm px-3 text-start font-medium text-fg hover:bg-surface-2"
    >
      <Icon name={icon} className="text-fg-3" />
      {children}
      {sub ? <span className="ms-auto text-xs text-fg-3">{sub}</span> : null}
    </button>
  );
}

function ChangeMentorDialog({
  student,
  mentors,
  open,
  onClose,
}: {
  student: StaffStudentDTO;
  mentors: MentorOptionDTO[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mentorId, setMentorId] = useState(student.mentor?.id ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await apiPut<StaffStudentDTO>(`/api/v1/students/${student.id}/mentor`, {
      mentorId: mentorId || null,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setSubmitting(false);
    if (result.ok) {
      onClose();
      toast.show({ message: 'مشاور هنرجو عوض شد.' });
      router.refresh();
      return;
    }
    setError(result.error.fields.mentorId ?? result.error.message);
  }

  return (
    <Dialog open={open} onClose={onClose} title={`تغییر مشاور ${student.displayName}`}>
      <form noValidate onSubmit={onSubmit}>
        {error ? <Alert tone="error" role="alert" title={error} /> : null}
        <SelectField label="مشاور" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
          {mentors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
          <option value="">بدون مشاور</option>
        </SelectField>
        <TextareaField
          label="دلیل"
          optional
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-[76px]"
        />
        <DialogActions>
          <Button onClick={onClose}>انصراف</Button>
          <Button type="submit" variant="primary" loading={submitting}>
            ثبت
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ReinviteDialog({
  student,
  open,
  onClose,
}: {
  student: StaffStudentDTO;
  open: boolean;
  onClose: () => void;
}) {
  const [result, setResult] = useState<NewStudentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function create() {
    setSubmitting(true);
    setError(null);
    const res = await apiPost<{ inviteUrl: string; expiresAt: string }>(
      `/api/v1/users/${student.id}/invite-link`,
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({
        student,
        inviteUrl: res.data.inviteUrl,
        expiresAt: res.data.expiresAt,
        profileError: null,
      });
      return;
    }
    setError(
      res.error.status === 409
        ? 'این هنرجو قبلاً وارد شده و لینک دعوت لازم ندارد.'
        : res.error.message,
    );
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setResult(null);
        onClose();
      }}
      title={result ? 'لینک دعوت تازه' : 'ارسال دوباره‌ی لینک دعوت'}
    >
      {result ? (
        <InviteReady result={result} onDone={onClose} />
      ) : (
        <>
          {error ? <Alert tone="error" role="alert" title={error} /> : null}
          <p className="mb-4 text-ui text-fg-2">
            یک لینک یک‌بارمصرف تازه ساخته می‌شود و لینک قبلی دیگر کار نمی‌کند.
          </p>
          <DialogActions>
            <Button onClick={onClose}>انصراف</Button>
            <Button variant="primary" loading={submitting} onClick={() => void create()}>
              ساخت لینک تازه
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
