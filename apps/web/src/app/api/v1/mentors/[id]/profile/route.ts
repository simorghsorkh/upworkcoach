import { updateMentorProfileInput } from '@/modules/mentors/contracts';
import { updateMentorProfile } from '@/modules/mentors/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/mentors/:id/profile — A; M for themselves: specialties, bio, capacity. */
export const PUT = route({
  auth: true,
  input: updateMentorProfileInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await updateMentorProfile(auth.actor, (params as { id: string }).id, input, meta)),
});
