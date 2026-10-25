'use client';

import { RouteError } from '../_components/route-error';

export default function TasksError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="کارها" retry={retry} />;
}
