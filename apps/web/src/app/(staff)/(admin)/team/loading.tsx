import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <PageHead title="تیم" />
      <Card>
        <SkeletonRows rows={4} label="در حال بارگذاری اعضای تیم…" />
      </Card>
    </>
  );
}
