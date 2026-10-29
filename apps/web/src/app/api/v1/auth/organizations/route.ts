import { listMyOrganizations } from '@/modules/identity/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/auth/organizations — the organizations the signed-in user can work in. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await listMyOrganizations(auth.actor)),
});
