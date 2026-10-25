import { getStudentHealth } from '@/modules/health/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/health — A, M in scope (never a student; ADR-0004). */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await getStudentHealth(auth.actor, params.id)),
});
