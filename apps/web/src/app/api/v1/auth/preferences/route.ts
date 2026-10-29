import { updatePreferencesInput } from '@/modules/identity/contracts';
import { updateMyPreferences } from '@/modules/identity/service';
import { getCookieConfig, serializeLocaleCookie } from '@/server/auth/cookies';
import { ok, route } from '@/server/http/handler';

/**
 * PATCH /api/v1/auth/preferences — any signed-in user: `{ locale }` (ADR-0013). Also sets
 * the `uc_locale` cookie so the sign-in page of this browser follows.
 */
export const PATCH = route({
  auth: true,
  input: updatePreferencesInput,
  handler: async ({ auth, input }) => {
    const result = await updateMyPreferences(auth.actor, input);
    return ok(result, {
      cookies: [serializeLocaleCookie(result.locale, getCookieConfig().secure)],
    });
  },
});
