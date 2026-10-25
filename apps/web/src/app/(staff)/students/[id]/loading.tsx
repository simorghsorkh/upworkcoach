import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="md:p-6">
        <SkeletonRows rows={2} label="در حال بارگذاری پرونده…" />
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <SkeletonRows rows={4} label="" />
        </Card>
        <Card>
          <SkeletonRows rows={3} label="" />
        </Card>
      </div>
    </div>
  );
}
