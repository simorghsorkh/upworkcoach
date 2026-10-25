import { reauthInput } from '@/modules/identity/contracts';
import { reauthenticate } from '@/modules/identity/service';
import { ok, route } from '@/server/http/handler';

/**
 * POST /api/v1/auth/reauth — any signed-in user: `{ password }` → `{ validUntil }`
 * (SEC-S7, ADR-0003 section 8, followup F-06). Wrong password → 422 `fields.password`,
 * counted with change-password (5 in 15 minutes → 429).
 */
export const POST = route({
  auth: true,
  input: reauthInput,
  handler: async ({ auth, input, meta }) =>
    ok(await reauthenticate(auth.actor, auth.sessionId, input, meta)),
});
