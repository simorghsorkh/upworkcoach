import { completeReminder } from '@/modules/reminders/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/reminders/:id/done — owner or A ("Done"). */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await completeReminder(auth.actor, params.id)),
});
