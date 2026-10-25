import { getPublicSettings } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/settings/public — any role: response-time text and check-in on/off. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await getPublicSettings(auth.actor)),
});
