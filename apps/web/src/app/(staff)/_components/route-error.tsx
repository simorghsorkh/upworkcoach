'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { ErrorState } from '@/components/ui/states';

/** Shared body of the staff `error.tsx` files: what failed + "Try again". */
export function RouteError({ title, retry }: { title: string; retry: () => void }) {
  const t = useTranslations('routeError');
  return (
    <>
      <PageHead title={title} />
      <Card>
        <ErrorState title={t('title')} onRetry={retry}>
          {t('body')}
        </ErrorState>
      </Card>
    </>
  );
}
