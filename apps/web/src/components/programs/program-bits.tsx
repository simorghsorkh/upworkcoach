'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { TextField } from '@/components/ui/field';
import { JalaliDateField } from '@/components/ui/jalali-date-field';
import type { RunStatus, TemplateStatus, TemplateVisibility } from '@/modules/programs/schema';
import { Tag, type TagVariant } from '../ui/badge';
import { dayDate, isolate, numberOrNull } from './program-text';

export { dayDate, isolate, numberOrNull };

/** Calendar day input (ADR-0013 §5): Jalali for Persian, the native picker otherwise. */
export function DayField({
  label,
  value,
  onChange,
  min,
  error,
}: {
  label: ReactNode;
  value: string;
  onChange: (day: string) => void;
  min?: string;
  error?: string | null;
}) {
  const locale = useLocale();
  if (locale === 'fa') {
    return (
      <JalaliDateField
        label={label}
        value={value}
        onChange={onChange}
        min={min}
        shortcuts={[]}
        error={error}
      />
    );
  }
  return (
    <TextField
      type="date"
      label={label}
      value={value}
      min={min}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const RUN_TAG: Record<RunStatus, TagVariant> = {
  draft: 'outline',
  active: 'gate',
  completed: 'neutral',
  archived: 'neutral',
};

export function RunStatusTag({ status }: { status: RunStatus }) {
  const t = useTranslations('programs.runStatus');
  return <Tag variant={RUN_TAG[status]}>{t(status)}</Tag>;
}

export function TemplateStatusTags({
  status,
  visibility,
  isLegacy,
}: {
  status: TemplateStatus;
  visibility: TemplateVisibility;
  isLegacy: boolean;
}) {
  const t = useTranslations('programs');
  return (
    <>
      <Tag variant={status === 'published' ? 'gate' : 'outline'}>
        {t(`templateStatus.${status}`)}
      </Tag>
      {visibility !== 'organization' ? (
        <Tag variant={visibility === 'pending_approval' ? 'new' : 'outline'} icon="lock">
          {t(`visibility.${visibility}`)}
        </Tag>
      ) : null}
      {isLegacy ? <Tag icon="route">{t('legacy')}</Tag> : null}
    </>
  );
}
