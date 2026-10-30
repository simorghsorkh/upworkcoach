'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiPut } from '@/components/api/client';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';

/** "Assign to…" (admin, F8): only active staff are offered (C3). */
export function AssigneeForm({
  threadId,
  current,
  staff,
  viewerId,
}: {
  threadId: string;
  current: string;
  staff: Array<{ id: string; displayName: string; role: 'admin' | 'mentor' }>;
  viewerId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving || value === current) return;
    setSaving(true);
    setError(null);
    const res = await apiPut(`/api/v1/questions/${threadId}/assignee`, { assigneeId: value });
    setSaving(false);
    if (res.ok) {
      toast.show({ message: 'سؤال واگذار شد.' });
      router.refresh();
      return;
    }
    setError(res.error.fields.assigneeId ?? res.error.message);
  }

  return (
    <div>
      {error ? <Alert tone="error" role="alert" title={error} /> : null}
      <SelectField
        label="پاسخ‌گو"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        fieldClassName="mb-3"
      >
        {staff.map((m) => (
          <option key={m.id} value={m.id}>
            {`${m.id === viewerId ? 'خودم' : m.displayName}${m.role === 'admin' ? ' (مدیر)' : ''}`}
          </option>
        ))}
      </SelectField>
      <Button
        size="sm"
        onClick={() => void save()}
        loading={saving}
        disabled={value === current}
        block
      >
        واگذاری
      </Button>
    </div>
  );
}
