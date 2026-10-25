import { loginInput } from '@/modules/identity/contracts';
import { login } from '@/modules/identity/service';
import { authCookies } from '@/server/auth/request';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/auth/login — public (ADR-0003 section 4). */
export const POST = route({
  auth: false,
  input: loginInput,
  handler: async ({ input, meta }) => {
    const result = await login(input, meta);
    return ok({ user: result.user }, { cookies: authCookies(result) });
  },
});
