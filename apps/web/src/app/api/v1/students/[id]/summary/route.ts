import { getStudentSummary } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/summary — A, M in scope (question side panel, F8). */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await getStudentSummary(auth.actor, params.id)),
});
