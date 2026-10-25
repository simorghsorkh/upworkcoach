'use client';

import { RouteError } from '../../_components/route-error';

export default function TaskError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="کار" retry={retry} />;
}
