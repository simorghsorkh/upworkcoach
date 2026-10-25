'use client';

import { RouteError } from '../_components/route-error';

export default function TodayError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="امروز" retry={retry} />;
}
