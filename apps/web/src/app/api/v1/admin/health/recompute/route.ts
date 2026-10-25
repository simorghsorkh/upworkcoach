import { recomputeInput } from '@/modules/health/contracts';
import { adminRecompute } from '@/modules/health/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/admin/health/recompute — A: one student or a full sweep (debugging). */
export const POST = route({
  auth: true,
  input: recomputeInput,
  handler: async ({ auth, input, meta }) => ok(await adminRecompute(auth.actor, input, meta)),
});
