import { logout } from '@/modules/identity/service';
import { clearedSessionCookie } from '@/server/auth/request';
import { route } from '@/server/http/handler';

/** POST /api/v1/auth/logout — any signed-in user (SEC-S5). */
export const POST = route({
  auth: true,
  handler: async ({ auth }) => {
    await logout(auth.sessionToken);
    return {
      status: 204,
      cookies: [clearedSessionCookie()],
      headers: { 'clear-site-data': '"cache"' },
    };
  },
});
