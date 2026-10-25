import { updateReminderInput } from '@/modules/reminders/contracts';
import { cancelReminder, updateReminder } from '@/modules/reminders/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/reminders/:id — owner (student in scope) or A. */
export const PATCH = route({
  auth: true,
  input: updateReminderInput,
  handler: async ({ auth, params, input }) =>
    ok(await updateReminder(auth.actor, (params as { id: string }).id, input)),
});

/** DELETE /api/v1/reminders/:id — owner or A: → cancelled (204). */
export const DELETE = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => {
    await cancelReminder(auth.actor, params.id);
    return { status: 204 };
  },
});
