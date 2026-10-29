'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { apiPost, apiPut } from '@/components/api/client';
import { CheckboxField, splitApiError } from '@/components/forms/form-utils';
import { Icon } from '@/components/icons/icon';
import { isolate, numberOrNull } from '@/components/programs/program-text';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { MentorProfileDTO, TransferResultDTO } from '@/modules/mentors/contracts';

const PROFILE_FIELDS = ['specialties', 'bio', 'capacity'] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

/** "Edit card": specialties, bio, capacity and «taking new mentees» (admin or self). */
export function EditProfileButton({
  mentorId,
  profile,
}: {
  mentorId: string;
  profile: MentorProfileDTO;
}) {
  const t = useTranslations('mentors');
  const tf = useTranslations('mentors.field');
  const tc = useTranslations('common');
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [specialties, setSpecialties] = useState(profile.specialties.join(', '));
  const [bio, setBio] = useState(profile.bio ?? '');
  const [capacity, setCapacity] = useState(
    profile.capacity === null ? '' : String(profile.capacity),
  );
  const [accepting, setAccepting] = useState(profile.acceptingStudents);
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const result = await apiPut(`/api/v1/mentors/${mentorId}/profile`, {
      specialties: specialties
        .split(/[,\u060c]/)
        .map((s) => s.trim())
        .filter(Boolean),
      // longText turns an empty string into null (no bio).
      bio,
      capacity: numberOrNull(capacity),
      acceptingStudents: accepting,
    });
    setBusy(false);
    if (!result.ok) {
      const split = splitApiError(result.error, PROFILE_FIELDS);
      setErrors(split.fields);
      setFormError(split.form);
      return;
    }
    toast.show({ message: t('profileSaved') });
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="pen" size={16} />
        {t('editCard')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('editCard')}>
        <form onSubmit={submit} noValidate>
          {formError ? (
            <Alert tone="error" className="mb-4">
              {formError}
            </Alert>
          ) : null}
          <TextField
            label={tf('specialties')}
            value={specialties}
            onChange={(e) => setSpecialties(e.target.value)}
            hint={tf('specialtiesHint')}
            error={errors.specialties}
          />
          <TextareaField
            label={tf('bio')}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            error={errors.bio}
            maxLength={1000}
            rows={4}
          />
          <TextField
            label={tf('capacity')}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            hint={tf('capacityHint')}
            error={errors.capacity}
            inputMode="numeric"
            dir="ltr"
          />
          <CheckboxField
            label={tf('accepting')}
            checked={accepting}
            onChange={(e) => setAccepting(e.target.checked)}
          />
          <DialogActions>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {tc('save')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}

/** "Transfer all mentees" (admin): every enrollment they are primary mentor of moves. */
export function TransferButton({
  mentorId,
  mentorName,
  others,
}: {
  mentorId: string;
  mentorName: string;
  others: Array<{ id: string; displayName: string }>;
}) {
  const t = useTranslations('mentors');
  const tc = useTranslations('common');
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [toMentorId, setToMentorId] = useState(others[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!toMentorId) return;
    setBusy(true);
    setError(null);
    const result = await apiPost<TransferResultDTO>(`/api/v1/mentors/${mentorId}/transfer`, {
      toMentorId,
      ...(reason.trim() ? { reason } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.show({ message: t('transferred', { count: result.data.moved }) });
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="users" size={16} />
        {t('transfer')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('transferTitle', { name: isolate(mentorName) })}
        description={t('transferHint', { name: isolate(mentorName) })}
      >
        <form onSubmit={submit} noValidate>
          {error ? (
            <Alert tone="error" className="mb-4">
              {error}
            </Alert>
          ) : null}
          <SelectField
            label={t('transferTo')}
            value={toMentorId}
            onChange={(e) => setToMentorId(e.target.value)}
            hint={others.length ? undefined : t('noOther')}
          >
            {others.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </SelectField>
          <TextareaField
            label={t('reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
          />
          <DialogActions>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!toMentorId}>
              {t('transfer')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
