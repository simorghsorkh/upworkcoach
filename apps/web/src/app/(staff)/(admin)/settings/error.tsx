'use client';

import { RouteError } from '../../_components/route-error';

export default function SettingsError({ retry }: { error: Error; retry: () => void }) {
  return <RouteError title="تنظیمات" retry={retry} />;
}
