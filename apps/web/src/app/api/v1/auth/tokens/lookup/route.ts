import { tokenLookupInput } from '@/modules/identity/contracts';
import { lookupToken } from '@/modules/identity/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/auth/tokens/lookup — public; the token is only ever in the body (C1). */
export const POST = route({
  auth: false,
  input: tokenLookupInput,
  handler: async ({ input, meta }) => ok(await lookupToken(input.token, meta)),
});
