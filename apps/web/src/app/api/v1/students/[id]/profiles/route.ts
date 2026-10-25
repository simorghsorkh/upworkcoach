import { createProfileInput } from '@/modules/students/contracts';
import { createStudentProfile, listStudentProfiles } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/profiles — A, M in scope. */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await listStudentProfiles(auth.actor, params.id)),
});

/** POST /api/v1/students/:id/profiles — A, M in scope. No password field exists. */
export const POST = route({
  auth: true,
  input: createProfileInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await createStudentProfile(auth.actor, (params as { id: string }).id, input),
  }),
});
