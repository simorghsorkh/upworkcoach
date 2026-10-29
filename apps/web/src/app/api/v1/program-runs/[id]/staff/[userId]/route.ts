import { endStaff } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** DELETE /api/v1/program-runs/:id/staff/:userId — ends the staff row (history stays). */
export const DELETE = route<{ id: string; userId: string }>({
  auth: true,
  handler: async ({ auth, params, meta }) =>
    ok(await endStaff(auth.actor, params.id, params.userId, meta)),
});
