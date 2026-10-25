'use client';

import { StudentRouteError } from '@/app/(student)/_error';

export default function RouteError({ retry }: { error: Error; retry: () => void }) {
  return <StudentRouteError retry={retry} />;
}
