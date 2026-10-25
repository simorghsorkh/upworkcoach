import { changePasswordInput } from '@/modules/identity/contracts';
import { changePassword } from '@/modules/identity/service';
import { authCookies } from '@/server/auth/request';
import { route } from '@/server/http/handler';

/** POST /api/v1/auth/change-password — any signed-in user; rotates the current session. */
export const POST = route({
  auth: true,
  input: changePasswordInput,
  handler: async ({ auth, input, meta }) => {
    const result = await changePassword(auth.actor, input, meta);
    return { status: 204, cookies: authCookies(result) };
  },
});
