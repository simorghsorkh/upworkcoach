'use client';

import { useTranslations } from 'next-intl';
import { RouteError } from '../_components/route-error';

export default function MentorsError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations('mentors');
  return <RouteError title={t('title')} retry={retry} />;
}
