import { tokenAcceptInput } from '@/modules/identity/contracts';
import { acceptToken } from '@/modules/identity/service';
import { authCookies } from '@/server/auth/request';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/auth/tokens/accept — public; invite and password reset (C1). */
export const POST = route({
  auth: false,
  input: tokenAcceptInput,
  handler: async ({ input, meta }) => {
    const result = await acceptToken(input, meta);
    return ok({ user: result.user }, { cookies: authCookies(result) });
  },
});
