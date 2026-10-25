import { z } from 'zod';
import { updateSetting } from '@/modules/catalog/service';
import { requireRecentPassword } from '@/server/auth/request';
import { ok, route } from '@/server/http/handler';

/** The value is validated by the schema of `:key` inside the service. */
const anyJson = z.unknown();

/**
 * PUT /api/v1/settings/:key — A: the body is the value of that key (api.md 13). `access`
 * needs a recent password (SEC-S7, F-06).
 */
export const PUT = route({
  auth: true,
  input: anyJson,
  handler: async ({ auth, params, input, meta }) => {
    const key = (params as { key: string }).key;
    if (key === 'access') requireRecentPassword(auth);
    return ok(await updateSetting(auth.actor, key, input, meta));
  },
});
