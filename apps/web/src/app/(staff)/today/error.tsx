'use client';

import { useTranslations } from 'next-intl';
import { RouteError } from '../_components/route-error';

export default function TodayError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations('today');
  return <RouteError title={t('title')} retry={retry} />;
}
