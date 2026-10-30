/**
 * pnpm org:create --slug takanesh --name "Takanesh Academy" [--locale fa|en]
 * Creates an organization with its default catalog (ADR-0011) and its default interface
 * language (ADR-0013, Persian unless given). Its first admin comes next:
 * `pnpm admin:create --org <slug> …`.
 */
import { parseArgs } from 'node:util';
import { requireArg, runCli } from './lib/cli';

const USAGE = 'pnpm org:create --slug lower-case-slug --name "Display Name" [--locale fa|en]';
const { values } = parseArgs({
  options: { slug: { type: 'string' }, name: { type: 'string' }, locale: { type: 'string' } },
  strict: true,
});

await runCli(async () => {
  const slug = requireArg(values.slug, 'slug', USAGE);
  const name = requireArg(values.name, 'name', USAGE);
  const { createOrganization } = await import('../src/modules/identity/organizations');
  const result = await createOrganization({ slug, name, locale: values.locale });
  console.info(`Organization created: ${result.id}`);
  console.info(`Default catalog rows added: ${JSON.stringify(result.seeded)}`);
  console.info(`Next: pnpm admin:create --org ${slug} --phone 0912xxxxxxx --name "…"`);
});
