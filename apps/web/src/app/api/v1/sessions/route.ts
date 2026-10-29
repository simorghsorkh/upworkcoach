import { createSessionInput, sessionListQuery } from '@/modules/mentoring/contracts';
import { createSession, listSessions } from '@/modules/mentoring/service';
import { ok, route } from '@/server/http/handler';

/**
 * GET /api/v1/sessions — mentoring sessions the caller sees (by run, by student, or their
 * own); `when=upcoming|past` (Coach Office sprint 5b).
 */
export const GET = route({
  auth: true,
  query: sessionListQuery,
  handler: async ({ auth, query }) => ok(await listSessions(auth.actor, query)),
});

/** POST /api/v1/sessions — A, M: book a session for a member or the whole group. */
export const POST = route({
  auth: true,
  input: createSessionInput,
  handler: async ({ auth, input }) => ({
    status: 201,
    body: await createSession(auth.actor, input),
  }),
});
