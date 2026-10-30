/**
 * pnpm admin:create --phone 0912… --name "Admin Name" [--org <slug>]
 * Creates the FIRST admin (owner) of an organization — default: the organization of the 0.1
 * data — refuses when it has an admin already, and prints a 1-hour setup link.
 * ADR-0003 section 1 (`admin:bootstrap`), ADR-0011, security.md SEC-T6 / SEC-E3.
 */
import { parseArgs } from 'node:util';
import { requireArg, runCli } from './lib/cli';

const USAGE = 'pnpm admin:create --phone 0912xxxxxxx --name "Display Name" [--org slug]';
const { values } = parseArgs({
  options: { phone: { type: 'string' }, name: { type: 'string' }, org: { type: 'string' } },
  strict: true,
});

await runCli(async () => {
  const phone = requireArg(values.phone, 'phone', USAGE);
  const name = requireArg(values.name, 'name', USAGE);
  const { bootstrapAdmin } = await import('../src/modules/identity/service');
  const { organizationIdBySlug } = await import('../src/modules/identity/organizations');
  const organizationId = values.org ? await organizationIdBySlug(values.org) : undefined;
  const result = await bootstrapAdmin({ phone, displayName: name, organizationId });
  console.info('Admin created (status: invited).');
  console.info(
    `Open this link within 1 hour to set the password (valid until ${result.expiresAt.toISOString()}):`,
  );
  console.info(result.setupUrl);
  console.info('The link is shown only once. Do not paste it into chats or tickets.');
});
