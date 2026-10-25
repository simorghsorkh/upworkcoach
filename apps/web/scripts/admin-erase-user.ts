/**
 * pnpm admin:erase-user --id <uuid> --confirm "<current display name>" --requested-on YYYY-MM-DD
 * Account erasure by anonymisation (ADR-0010, data-model.md 6-2). Irreversible.
 * Sprint 1: identity tables + audit_log; later modules add their tables (see TODOs in
 * identity/service.ts eraseUser).
 */
import { parseArgs } from 'node:util';
import { requireArg, runCli } from './lib/cli';

const USAGE =
  'pnpm admin:erase-user --id <uuid> --confirm "<display name>" --requested-on YYYY-MM-DD';
const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    confirm: { type: 'string' },
    'requested-on': { type: 'string' },
  },
  strict: true,
});

await runCli(async () => {
  const userId = requireArg(values.id, 'id', USAGE);
  const confirmDisplayName = requireArg(values.confirm, 'confirm', USAGE);
  const requestedOn = requireArg(values['requested-on'], 'requested-on', USAGE);
  const { eraseUser } = await import('../src/modules/identity/service');
  const outcome = await eraseUser({ userId, confirmDisplayName, requestedOn });
  console.info(outcome === 'erased' ? 'User erased.' : 'User was already erased; nothing changed.');
});
