import { endEnrollmentMentor } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** DELETE /api/v1/enrollments/:id/mentors/:userId — A: the assignment ends (history stays). */
export const DELETE = route<{ id: string; userId: string }>({
  auth: true,
  handler: async ({ auth, params, meta }) =>
    ok(await endEnrollmentMentor(auth.actor, params.id, params.userId, meta)),
});
