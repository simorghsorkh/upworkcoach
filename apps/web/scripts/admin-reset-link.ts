/**
 * pnpm admin:reset-link --phone 0912…
 * Recovery for the only admin (security.md SEC-T7): 1-hour reset link, clears the login
 * locks of that phone, audit row with actor null.
 */
import { parseArgs } from 'node:util';
import { requireArg, runCli } from './lib/cli';

const USAGE = 'pnpm admin:reset-link --phone 0912xxxxxxx';
const { values } = parseArgs({ options: { phone: { type: 'string' } }, strict: true });

await runCli(async () => {
  const phone = requireArg(values.phone, 'phone', USAGE);
  const { createCliResetLink } = await import('../src/modules/identity/service');
  const result = await createCliResetLink({ phone });
  const kind = result.purpose === 'invite' ? 'Invite link (account not set up yet)' : 'Reset link';
  console.info(`${kind}, valid until ${result.expiresAt.toISOString()}:`);
  console.info(result.resetUrl);
  console.info('Login locks for this phone were cleared.');
});
