/**
 * pnpm org:list — every organization with its slug and active member count (ADR-0011).
 */
import { runCli } from './lib/cli';

await runCli(async () => {
  const { listOrganizations } = await import('../src/modules/identity/organizations');
  for (const org of await listOrganizations()) {
    console.info(`${org.slug}\t${org.status}\t${org.members} members\t${org.id}\t${org.name}`);
  }
});
