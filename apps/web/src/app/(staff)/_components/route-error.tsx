'use client';

import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { ErrorState } from '@/components/ui/states';

/** Shared body of the staff `error.tsx` files: what failed + «تلاش دوباره». */
export function RouteError({ title, retry }: { title: string; retry: () => void }) {
  return (
    <>
      <PageHead title={title} />
      <Card>
        <ErrorState title="این صفحه بار نشد" onRetry={retry}>
          اتصال اینترنت را بررسی کن و دوباره بزن. اگر باز هم نشد، چند دقیقه‌ی دیگر امتحان کن.
        </ErrorState>
      </Card>
    </>
  );
}
