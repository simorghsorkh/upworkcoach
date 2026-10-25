import { Card } from '@/components/ui/card';
import { Skeleton, SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-6 h-8 w-40" />
      <Card>
        <SkeletonRows rows={5} label="در حال بارگذاری سؤال‌ها…" />
      </Card>
    </>
  );
}
