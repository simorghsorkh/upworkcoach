import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const isCI = Boolean(process.env.CI);

/**
 * E2E in the two target sizes from docs/03-ux: desktop 1440px and mobile 375px.
 * Uses Chromium only (install once: `pnpm --filter @upworkcoach/web exec playwright install chromium`).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // A throwaway Postgres (migrated + seeded, one admin) and `next dev` on PORT; never the dev
  // database on 5432. See tests/e2e/server/start.ts. The teardown stops Postgres even when the
  // server process tree was force-killed.
  globalTeardown: './tests/e2e/global-teardown.ts',
  webServer: {
    command: 'tsx tests/e2e/server/start.ts',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    stderr: 'pipe',
    env: { JOBS_MODE: 'off' },
  },
});
