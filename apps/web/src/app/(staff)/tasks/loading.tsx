import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <PageHead title="کارها" />
      <Card>
        <SkeletonRows rows={6} label="در حال بارگذاری کارها…" />
      </Card>
    </>
  );
}
