'use client';

import { useEffect, useState } from 'react';
import { type PickedStudent, StudentPicker } from '@/components/students/student-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { NoteForm } from './note-form';

/**
 * «یادداشت تازه» sheet (mockups/today.html #note). With a known student (record page) the
 * form opens directly; from anywhere else (the «+» of the bottom bar) the student is searched
 * first — two letters are enough (user-flows §5).
 */
export function NoteDialog({
  open,
  onClose,
  student,
  onCreateTask,
}: {
  open: boolean;
  onClose: () => void;
  student?: PickedStudent | null;
  onCreateTask?: (student: PickedStudent, suggestedTitle: string, body: string) => void;
}) {
  const [picked, setPicked] = useState<PickedStudent[]>(student ? [student] : []);
  useEffect(() => {
    if (open) setPicked(student ? [student] : []);
  }, [open, student]);
  const target = picked[0];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={student ? `یادداشت برای ${student.displayName}` : 'یادداشت تازه'}
    >
      {student ? null : (
        <StudentPicker label="هنرجو" value={picked} onChange={setPicked} autoFocus={!target} />
      )}
      {target ? (
        <NoteForm
          key={target.id}
          student={target}
          variant="sheet"
          autoFocus={Boolean(student) || picked.length > 0}
          onSaved={onClose}
          onCancel={onClose}
          onCreateTask={
            onCreateTask ? (title, body) => onCreateTask(target, title, body) : undefined
          }
        />
      ) : (
        <DialogActions>
          <Button onClick={onClose}>انصراف</Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
