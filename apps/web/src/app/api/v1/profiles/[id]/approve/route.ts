import { approveProfile } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/profiles/:id/approve — A, M in scope. */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await approveProfile(auth.actor, params.id)),
});
