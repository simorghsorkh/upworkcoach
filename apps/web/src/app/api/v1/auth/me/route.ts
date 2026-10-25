import { ok, route } from '@/server/http/handler';

/** GET /api/v1/auth/me — any signed-in user. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(auth.user),
});
