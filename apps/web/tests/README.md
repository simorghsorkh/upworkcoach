# tests

| Folder | Tool | Run |
|---|---|---|
| `integration/` | Vitest + real Postgres | `pnpm test` (together with unit tests) |
| `e2e/` | Playwright, desktop 1440 and mobile 375 | `pnpm test:e2e` |

Unit tests live next to the code: `src/**/*.test.ts`.

Integration tests never connect to the development database (`.data/pg`): `global-setup.ts` creates a temporary Postgres 16
on a free port, runs the migrations and removes it at the end (ADR-0009). In CI, `TEST_DATABASE_URL` (a service container)
is used instead. In tests, get the URL with `inject('databaseUrl')`.
The access matrix (ADR-0004) and the internal-note leak canary test are added here.
