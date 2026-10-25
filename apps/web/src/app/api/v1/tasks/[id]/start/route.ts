import { startTask } from '@/modules/tasks/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/tasks/:id/start — S (own task): open → in_progress. */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await startTask(auth.actor, params.id)),
});
