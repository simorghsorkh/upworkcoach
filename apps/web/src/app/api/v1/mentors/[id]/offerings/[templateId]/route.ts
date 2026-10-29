import { offeringInput } from '@/modules/scheduling/contracts';
import { setOffering } from '@/modules/scheduling/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/mentors/:id/offerings/:templateId — A; M for themselves (Coach Office sprint 7). */
export const PUT = route({
  auth: true,
  input: offeringInput,
  handler: async ({ auth, params, input }) => {
    const { id, templateId } = params as { id: string; templateId: string };
    return ok(await setOffering(auth.actor, id, templateId, input));
  },
});
