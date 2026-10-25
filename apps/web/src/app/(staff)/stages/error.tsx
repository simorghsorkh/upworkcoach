'use client';

import { RouteError } from '../_components/route-error';

export default function StagesError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="مراحل مسیر" retry={retry} />;
}
