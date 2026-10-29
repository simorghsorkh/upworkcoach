import { transferStudentsInput } from '@/modules/mentors/contracts';
import { transferMentorStudents } from '@/modules/mentors/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/mentors/:id/transfer — A: every student they are primary mentor of moves. */
export const POST = route({
  auth: true,
  input: transferStudentsInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await transferMentorStudents(auth.actor, (params as { id: string }).id, input, meta)),
});
