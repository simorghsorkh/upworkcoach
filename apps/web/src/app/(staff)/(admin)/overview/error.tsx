'use client';

import { useTranslations } from 'next-intl';
import { RouteError } from '../../_components/route-error';

export default function OverviewError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations('orgDashboard');
  return <RouteError title={t('title')} retry={retry} />;
}
