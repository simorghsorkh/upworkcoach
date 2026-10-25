'use client';

import { RouteError } from '../../_components/route-error';

export default function ResultsError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="نتایج" retry={retry} />;
}
