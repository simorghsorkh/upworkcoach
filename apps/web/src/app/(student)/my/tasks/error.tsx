'use client';

import { StudentRouteError } from '../../_error';

export default function RouteError({ retry }: { error: Error; retry: () => void }) {
  return <StudentRouteError retry={retry} />;
}
