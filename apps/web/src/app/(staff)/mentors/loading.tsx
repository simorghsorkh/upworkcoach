import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  const t = useTranslations('mentors');
  return (
    <>
      <PageHead title={t('title')} />
      <div className="flex flex-col gap-4 md:gap-5">
        <Card>
          <SkeletonRows rows={3} label={t('loading')} />
        </Card>
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      </div>
    </>
  );
}
