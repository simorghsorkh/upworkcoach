'use client';

import { RouteError } from '../_components/route-error';

export default function RemindersError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="یادآورهای من" retry={retry} />;
}
