import { updateSettingsInput } from '@/modules/catalog/contracts';
import { getSettings, updateSettings } from '@/modules/catalog/service';
import { requireRecentPassword } from '@/server/auth/request';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/settings — A: every key with value and version. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await getSettings(auth.actor)),
});

/**
 * PUT /api/v1/settings — A: any subset of keys in one transaction (audited). Changing
 * `access` needs a recent password (SEC-S7, F-06).
 */
export const PUT = route({
  auth: true,
  input: updateSettingsInput,
  handler: async ({ auth, input, meta }) => {
    if (input.access !== undefined) requireRecentPassword(auth);
    return ok(await updateSettings(auth.actor, input, meta));
  },
});
