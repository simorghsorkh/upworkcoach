import { snoozeReminderInput } from '@/modules/reminders/contracts';
import { snoozeReminder } from '@/modules/reminders/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/reminders/:id/snooze — owner or A: `{ days: 1 | 3 | 7 }` (F6). */
export const POST = route({
  auth: true,
  input: snoozeReminderInput,
  handler: async ({ auth, params, input }) =>
    ok(await snoozeReminder(auth.actor, (params as { id: string }).id, input)),
});
