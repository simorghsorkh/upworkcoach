import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getCurrentUser } from '@/server/auth/current-user';
import { DEFAULT_LOCALE, LOCALE_COOKIE, pickLocale } from './config';
import { messagesFor } from './messages';

/** Time zone when nobody is signed in (sign-in and invite pages). */
const DEFAULT_TIME_ZONE = 'Asia/Tehran';

/**
 * next-intl request config (ADR-0013 section 2). No locale in the URL: the signed-in user's
 * locale (preference → organization default) wins; signed-out pages follow the `uc_locale`
 * cookie of this browser; otherwise Persian. Dates follow the organization's time zone.
 */
export default getRequestConfig(async () => {
  const user = await getCurrentUser();
  const store = await cookies();
  const locale = user?.locale ?? pickLocale(store.get(LOCALE_COOKIE)?.value, DEFAULT_LOCALE);
  return {
    locale,
    timeZone: user?.organization.timeZone ?? DEFAULT_TIME_ZONE,
    messages: messagesFor(locale),
  };
});
