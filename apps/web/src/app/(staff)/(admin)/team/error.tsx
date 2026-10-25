'use client';

import { RouteError } from '../../_components/route-error';

export default function TeamError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="تیم" retry={retry} />;
}
