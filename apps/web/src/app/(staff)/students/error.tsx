'use client';

import { RouteError } from '../_components/route-error';

export default function StudentsError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="هنرجوها" retry={retry} />;
}
