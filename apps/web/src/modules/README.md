# modules — domain modules

One folder per module (`identity`, `students`, `tasks`, … — overview.md section 3) with these files:

| File | Role |
|---|---|
| `schema.ts` | This module's Drizzle tables; relative imports only (drizzle-kit does not understand the `@/` alias); also re-export from `src/server/db/schema.ts` |
| `contracts.ts` | zod schemas and DTOs |
| `policy.ts` | Access rules |
| `service.ts` | The only entry point from outside the module; first parameter is `actor` |
| `repo.ts` | Queries; used only inside the module |

A module does not write another module's tables. After changing `schema.ts`: run `pnpm db:generate` and review the generated SQL in `drizzle/`.
Column naming: camelCase in TypeScript, snake_case in the database (`casing: 'snake_case'`).
