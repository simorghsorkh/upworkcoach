import { Card } from '@/components/ui/card';
import { Skeleton, SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-2 h-7 w-2/3" />
      <Skeleton className="mb-6 w-1/3" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <Card>
          <SkeletonRows rows={5} label="در حال بارگذاری سؤال…" />
        </Card>
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      </div>
    </>
  );
}
