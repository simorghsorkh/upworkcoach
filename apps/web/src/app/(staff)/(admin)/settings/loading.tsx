import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <PageHead title="تنظیمات" />
      <Card>
        <SkeletonRows rows={5} label="در حال بارگذاری تنظیمات…" />
      </Card>
    </>
  );
}
