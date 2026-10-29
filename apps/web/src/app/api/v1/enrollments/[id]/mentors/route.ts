import { assignEnrollmentMentorInput } from '@/modules/programs/contracts';
import { assignEnrollmentMentor, listEnrollmentMentors } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/enrollments/:id/mentors — staff who may see the enrollment. */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await listEnrollmentMentors(auth.actor, params.id)),
});

/** POST /api/v1/enrollments/:id/mentors — A: add a secondary, or set (transfer) the primary. */
export const POST = route({
  auth: true,
  input: assignEnrollmentMentorInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await assignEnrollmentMentor(auth.actor, (params as { id: string }).id, input, meta)),
});
