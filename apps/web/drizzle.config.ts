import { defineConfig } from 'drizzle-kit';
import { loadRootEnv } from './scripts/lib/env';

loadRootEnv();

export default defineConfig({
  dialect: 'postgresql',
  // Infrastructure schema + one schema.ts per domain module (tech-stack.md section 2).
  schema: ['./src/server/db/schema.ts', './src/modules/*/schema.ts'],
  out: './drizzle',
  casing: 'snake_case',
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
  // Only used by drizzle-kit commands that talk to a database (e.g. `drizzle-kit studio`).
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
