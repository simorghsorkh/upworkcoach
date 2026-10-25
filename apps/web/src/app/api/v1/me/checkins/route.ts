import { createCheckinInput } from '@/modules/checkins/contracts';
import { submitCheckin } from '@/modules/checkins/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/me/checkins — S: one per week (409 for a second); `needsHelp` → a question. */
export const POST = route({
  auth: true,
  input: createCheckinInput,
  handler: async ({ auth, input }) => ({
    status: 201,
    body: await submitCheckin(auth.actor, input),
  }),
});
