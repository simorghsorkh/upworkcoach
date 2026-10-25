import { createReminderInput, listRemindersQuery } from '@/modules/reminders/contracts';
import { createReminder, listReminders } from '@/modules/reminders/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/reminders — A, M; `scope=today|upcoming|done`, `ownerId` (A), `studentId`. */
export const GET = route({
  auth: true,
  query: listRemindersQuery,
  handler: async ({ auth, query }) => ok(await listReminders(auth.actor, query)),
});

/** POST /api/v1/reminders — A, M (M: owner = self, student in scope). */
export const POST = route({
  auth: true,
  input: createReminderInput,
  handler: async ({ auth, input }) => ({
    status: 201,
    body: await createReminder(auth.actor, input),
  }),
});
