import { createInvitationInput } from '@/modules/identity/contracts';
import { createInvitation } from '@/modules/identity/service';
import { requireRecentPassword } from '@/server/auth/request';
import { route } from '@/server/http/handler';

/**
 * POST /api/v1/invitations — admin invites a mentor or an admin. inviteUrl is shown once.
 * SEC-S7 (F-06): a password entered in the last 30 minutes (else 403 REAUTH_REQUIRED).
 */
export const POST = route({
  auth: true,
  input: createInvitationInput,
  handler: async ({ auth, input, meta }) => {
    requireRecentPassword(auth);
    return { status: 201, body: await createInvitation(auth.actor, input, meta) };
  },
});
