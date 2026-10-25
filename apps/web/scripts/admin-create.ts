/**
 * pnpm admin:create --phone 0912… --name "نام مدیر"
 * Creates the FIRST admin (refuses when any admin exists) and prints a 1-hour setup link.
 * ADR-0003 section 1 (`admin:bootstrap`), security.md SEC-T6 / SEC-E3.
 */
import { parseArgs } from 'node:util';
import { requireArg, runCli } from './lib/cli';

const USAGE = 'pnpm admin:create --phone 0912xxxxxxx --name "Display Name"';
const { values } = parseArgs({
  options: { phone: { type: 'string' }, name: { type: 'string' } },
  strict: true,
});

await runCli(async () => {
  const phone = requireArg(values.phone, 'phone', USAGE);
  const name = requireArg(values.name, 'name', USAGE);
  const { bootstrapAdmin } = await import('../src/modules/identity/service');
  const result = await bootstrapAdmin({ phone, displayName: name });
  console.info('Admin created (status: invited).');
  console.info(
    `Open this link within 1 hour to set the password (valid until ${result.expiresAt.toISOString()}):`,
  );
  console.info(result.setupUrl);
  console.info('The link is shown only once. Do not paste it into chats or tickets.');
});
