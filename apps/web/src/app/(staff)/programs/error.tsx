'use client';

import { useTranslations } from 'next-intl';
import { RouteError } from '../_components/route-error';

export default function ProgramsError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations('programs');
  return <RouteError title={t('title')} retry={retry} />;
}
