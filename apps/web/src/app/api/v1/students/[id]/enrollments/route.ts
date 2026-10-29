import { listStudentEnrollments } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/enrollments — A, M in scope: the student's programs. */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await listStudentEnrollments(auth.actor, params.id)),
});
