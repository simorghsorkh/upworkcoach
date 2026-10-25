import { snoozeHealthInput } from '@/modules/health/contracts';
import { clearHealthSnooze, snoozeHealth } from '@/modules/health/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/students/:id/health/snooze — A, M in scope: «نادیده تا تاریخ» (F7). */
export const PUT = route({
  auth: true,
  input: snoozeHealthInput,
  handler: async ({ auth, params, input }) =>
    ok(await snoozeHealth(auth.actor, (params as { id: string }).id, input)),
});

/** DELETE /api/v1/students/:id/health/snooze — A, M in scope: back on the stuck lists. */
export const DELETE = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await clearHealthSnooze(auth.actor, params.id)),
});
