import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { SkeletonRows } from '@/components/ui/states';

export default async function Loading() {
  const t = await getTranslations('orgDashboard');
  return (
    <>
      <PageHead title={t('title')} />
      <Card>
        <SkeletonRows rows={6} label={t('loading')} />
      </Card>
    </>
  );
}
