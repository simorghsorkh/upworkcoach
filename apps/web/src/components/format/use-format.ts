import { useLocale, useTimeZone } from 'next-intl';
import { createFormat, type Format } from '@/lib/format';

const DEFAULT_TIME_ZONE = 'Asia/Tehran';

/** Formatting in the user's language and the organization's time zone (ADR-0013). */
export function useFormat(): Format {
  return createFormat(useLocale(), useTimeZone() ?? DEFAULT_TIME_ZONE);
}
