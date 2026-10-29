import { getMentor } from '@/modules/mentors/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/mentors/:id — A; M for themselves (others 404): card, students and runs. */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await getMentor(auth.actor, params.id)),
});
