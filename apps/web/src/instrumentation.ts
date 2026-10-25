// Runs once when the Next.js server starts (not during `next build`).
// Background jobs only run in the Node.js runtime (ADR-0007).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Fail fast on a bad environment instead of answering every request with 500.
  const { getEnv } = await import('./server/env');
  getEnv();

  const { startJobs } = await import('./server/jobs');
  const { logger } = await import('./server/logger');
  try {
    await startJobs();
  } catch (err) {
    // Do not take the web server down; /healthz reports the database state.
    logger.error({ err }, 'jobs: failed to start');
  }
}
