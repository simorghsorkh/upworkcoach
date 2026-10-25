'use client';

import { RouteError } from '@/app/(staff)/_components/route-error';

export default function QuestionsError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="سؤال‌ها" retry={retry} />;
}
