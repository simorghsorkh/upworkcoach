'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { apiGet, apiPost } from '@/components/api/client';
import { useFormat } from '@/components/format/use-format';
import { Icon } from '@/components/icons/icon';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { RadioCards } from '@/components/ui/choice';
import { TextareaField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type {
  BookableMentorDTO,
  BookingDTO,
  BookingPackageDTO,
  SlotsDTO,
} from '@/modules/scheduling/contracts';
import { SlotCalendar } from './slot-calendar';

/** What the mentee's package lets them do with one offering. */
function PackageLine({ pkg }: { pkg: BookingPackageDTO | null }) {
  const t = useTranslations('scheduling.mentee');
  if (!pkg) {
    return (
      <Alert tone="warn" className="mb-0">
        {t('noPackage')}
      </Alert>
    );
  }
  if (pkg.bookable === 0) {
    return (
      <Alert tone="warn" className="mb-0">
        {t('noneLeft')}
      </Alert>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-h-green-fg">
      <Icon name="check-circle" size={16} />
      {pkg.bookable === null ? t('packageUnlimited') : t('package', { count: pkg.bookable })}
    </p>
  );
}

/** Mentors taking bookings (sprint 7), each with their session types. */
export function MentorCards({ mentors }: { mentors: BookableMentorDTO[] }) {
  const t = useTranslations('scheduling');
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {mentors.map((m) => (
        <li key={m.id}>
          <Card className="flex h-full flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar id={m.id} name={m.displayName} />
              <div className="min-w-0">
                <h2 className="text-h2">
                  <bdi>{m.displayName}</bdi>
                </h2>
                {m.specialties.length ? (
                  <p className="text-sm text-fg-3">{m.specialties.join(' · ')}</p>
                ) : null}
              </div>
            </div>
            {m.bio ? <p className="line-clamp-3 text-sm text-fg-2">{m.bio}</p> : null}
            <ul className="flex flex-col gap-1.5">
              {m.offerings.map((o) => (
                <li key={o.templateId} className="flex flex-wrap items-center gap-2 text-sm">
                  <bdi className="font-medium">{o.title}</bdi>
                  <span className="text-fg-3">
                    {t('calendar.minutes', { count: o.sessionMinutes })}
                  </span>
                  {o.package ? (
                    <Tag variant="gate" icon="check">
                      {o.package.bookable === null
                        ? t('mentee.hasPackage')
                        : t('mentee.package', { count: o.package.bookable })}
                    </Tag>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-auto">
              <ButtonLink href={`/my/mentors/${m.id}`} variant="soft" size="sm">
                <Icon name="calendar" size={14} />
                {t('mentee.open')}
              </ButtonLink>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/**
 * One mentor (sprint 7): pick a session type, a free slot from the calendar and send the
 * request with an optional note. The mentor approves it; a slot taken meanwhile is refused.
 */
export function BookingForm({
  mentor,
  templateId: initialTemplate,
  slots: initialSlots,
}: {
  mentor: BookableMentorDTO;
  templateId: string;
  slots: SlotsDTO;
}) {
  const t = useTranslations('scheduling');
  const format = useFormat();
  const router = useRouter();
  const toast = useToast();
  const [templateId, setTemplateId] = useState(initialTemplate);
  const [slots, setSlots] = useState<SlotsDTO | null>(initialSlots);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offering = mentor.offerings.find((o) => o.templateId === templateId);

  async function reload(id: string) {
    setSlots(null);
    setSelected(null);
    const result = await apiGet<SlotsDTO>(`/api/v1/mentors/${mentor.id}/slots?templateId=${id}`);
    if (result.ok) setSlots(result.data);
    else setError(result.error.message);
  }

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const result = await apiPost<BookingDTO>('/api/v1/booking-requests', {
      mentorId: mentor.id,
      templateId,
      startsAt: selected,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      if (result.error.status === 409) await reload(templateId);
      return;
    }
    toast.show({ message: t('mentee.sent') });
    router.push('/my/mentors');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {mentor.bio ? (
        <Card>
          <p className="text-ui text-fg-2">{mentor.bio}</p>
        </Card>
      ) : null}
      <Card aria-labelledby="h-book">
        <CardHead title={t('mentee.title')} titleId="h-book" icon="calendar" />
        {mentor.offerings.length > 1 ? (
          <RadioCards
            legend={t('mentee.chooseType')}
            stack
            value={templateId}
            onChange={(id) => {
              setTemplateId(id);
              void reload(id);
            }}
            options={mentor.offerings.map((o) => ({
              value: o.templateId,
              ariaLabel: o.title,
              label: (
                <span className="flex flex-col">
                  <bdi className="font-semibold">{o.title}</bdi>
                  <span className="text-sm font-normal text-fg-3">
                    {t('calendar.minutes', { count: o.sessionMinutes })}
                  </span>
                </span>
              ),
            }))}
          />
        ) : offering ? (
          <p className="mb-3">
            <bdi className="font-semibold">{offering.title}</bdi>
            <span className="ms-2 text-sm text-fg-3">
              {t('calendar.minutes', { count: offering.sessionMinutes })}
            </span>
          </p>
        ) : null}
        {offering?.description ? (
          <p className="mb-3 text-sm text-fg-2">{offering.description}</p>
        ) : null}
        {offering ? (
          <div className="mb-4">
            <PackageLine pkg={offering.package} />
          </div>
        ) : null}
        {error ? (
          <Alert tone="error" role="alert">
            {error}
          </Alert>
        ) : null}
        {slots ? (
          <SlotCalendar key={templateId} data={slots} selected={selected} onSelect={setSelected} />
        ) : (
          <div className="h-24 animate-pulse rounded-md bg-surface-2" />
        )}
        {selected ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-3 font-semibold">
              {t('mentee.selected', { at: format.fullDate(new Date(selected)) })}{' '}
              <span className="tabular-nums">{format.time(new Date(selected))}</span>
            </p>
            <TextareaField
              label={t('mentee.noteLabel')}
              hint={t('mentee.noteHint')}
              optional
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="mb-3 text-sm text-fg-3">
              {t('mentee.approvalHint', { hours: offering?.cancelNoticeHours ?? 24 })}
            </p>
            <Button variant="primary" disabled={busy} onClick={submit}>
              {t('mentee.request')}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
