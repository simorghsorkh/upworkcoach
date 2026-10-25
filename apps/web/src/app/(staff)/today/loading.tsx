import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { Skeleton, SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <PageHead title="امروز" />
      <div className="mb-4 grid grid-cols-2 gap-2 md:mb-6 md:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-3 md:p-5">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="w-2/3" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SkeletonRows rows={4} label="در حال بارگذاری امروز…" />
        </Card>
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      </div>
    </>
  );
}
