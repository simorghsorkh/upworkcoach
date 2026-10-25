import { clearFlag } from '@/modules/health/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/flags/:id/clear — A, M in scope. */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await clearFlag(auth.actor, params.id)),
});
