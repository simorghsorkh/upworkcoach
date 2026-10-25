import { createProfileInput } from '@/modules/students/contracts';
import { createOwnProfile, listOwnProfiles } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/me/profiles — student only. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await listOwnProfiles(auth.actor)),
});

/** POST /api/v1/me/profiles — student only. No password field exists. */
export const POST = route({
  auth: true,
  input: createProfileInput,
  handler: async ({ auth, input }) => ({
    status: 201,
    body: await createOwnProfile(auth.actor, input),
  }),
});
