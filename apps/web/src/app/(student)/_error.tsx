'use client';

import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';

export function StudentRouteError({ retry }: { retry: () => void }) {
  return (
    <Card>
      <ErrorState title="این صفحه بار نشد" onRetry={retry}>
        اتصال اینترنتت را بررسی کن و دوباره بزن.
      </ErrorState>
    </Card>
  );
}
