import { switchOrganizationInput } from '@/modules/identity/contracts';
import { switchOrganization } from '@/modules/identity/service';
import { authCookies } from '@/server/auth/request';
import { ok, route } from '@/server/http/handler';

/**
 * POST /api/v1/auth/organization — any signed-in user: `{ organizationId }` moves this
 * browser to another organization of theirs (ADR-0011 section 2); the session is rotated.
 */
export const POST = route({
  auth: true,
  input: switchOrganizationInput,
  handler: async ({ auth, input, meta }) => {
    const result = await switchOrganization(auth.actor, auth.sessionToken, input, meta);
    return ok({ user: result.user }, { cookies: authCookies(result) });
  },
});
