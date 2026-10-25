'use client';

import { RouteError } from '../../_components/route-error';

export default function StudentError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="پرونده‌ی هنرجو" retry={retry} />;
}
