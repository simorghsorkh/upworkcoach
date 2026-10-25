import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  return (
    <Card>
      <SkeletonRows rows={4} />
    </Card>
  );
}
