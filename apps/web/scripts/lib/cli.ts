import { loadRootEnv } from './env';

/**
 * Shared setup for admin CLIs run on the server console (ADR-0003, ADR-0010).
 * Links are printed to stdout of this process only — never logged (SEC-T6).
 */
export async function runCli(main: () => Promise<void>): Promise<void> {
  loadRootEnv();
  // Keep app logs out of the CLI output; warnings and errors still show.
  process.env.LOG_LEVEL = 'warn';
  // The CLI never starts background jobs.
  process.env.JOBS_MODE = 'off';
  const { CliError } = await import('../../src/modules/identity/service');
  const { closeDb } = await import('../../src/server/db');
  const { ApiError } = await import('../../src/server/http/errors');
  try {
    await main();
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`error: ${err.message}`);
    } else if (err instanceof ApiError) {
      const fields = err.fields ? ` ${JSON.stringify(err.fields)}` : '';
      console.error(`error: ${err.code}${fields}`);
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

export function requireArg(value: string | undefined, name: string, usage: string): string {
  if (!value) {
    console.error(`missing --${name}\nusage: ${usage}`);
    process.exit(2);
  }
  return value;
}
