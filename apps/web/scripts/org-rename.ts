/**
 * pnpm org:rename --slug default --name "آکادمی تکانش" [--new-slug takanesh]
 * Renames an organization (ADR-0011); e.g. the default organization of the 0.1 data
 * becomes the pilot academy, with all its users and students.
 */
import { parseArgs } from 'node:util';
import { requireArg, runCli } from './lib/cli';

const USAGE = 'pnpm org:rename --slug current-slug [--name "New Name"] [--new-slug new-slug]';
const { values } = parseArgs({
  options: {
    slug: { type: 'string' },
    name: { type: 'string' },
    'new-slug': { type: 'string' },
  },
  strict: true,
});

await runCli(async () => {
  const slug = requireArg(values.slug, 'slug', USAGE);
  const { renameOrganization } = await import('../src/modules/identity/organizations');
  const result = await renameOrganization({ slug, name: values.name, newSlug: values['new-slug'] });
  console.info(`Organization ${result.id} is now "${result.name}" (slug: ${result.slug}).`);
});
