/**
 * pnpm org:add-member --org takanesh --phone 0912… --role mentor
 * Adds an EXISTING account to one more organization as admin or mentor (ADR-0011).
 * New people are invited from the app; mentees belong to one organization only.
 */
import { parseArgs } from 'node:util';
import { requireArg, runCli } from './lib/cli';

const USAGE = 'pnpm org:add-member --org slug --phone 0912xxxxxxx --role admin|mentor';
const { values } = parseArgs({
  options: { org: { type: 'string' }, phone: { type: 'string' }, role: { type: 'string' } },
  strict: true,
});

await runCli(async () => {
  const org = requireArg(values.org, 'org', USAGE);
  const phone = requireArg(values.phone, 'phone', USAGE);
  const role = requireArg(values.role, 'role', USAGE);
  const { addOrganizationMember } = await import('../src/modules/identity/organizations');
  const result = await addOrganizationMember({ org, phone, role });
  console.info(`User ${result.userId} is now ${role} of organization ${result.organizationId}.`);
  console.info('They pick the organization from the account page after signing in.');
});
