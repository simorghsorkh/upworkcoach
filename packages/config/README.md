# @upworkcoach/config

Shared configuration for all packages in the repository:

- `tsconfig/base.json` — strict TypeScript (`strict` + `noUncheckedIndexedAccess`).
- `tsconfig/nextjs.json` — the same, plus DOM and JSX for Next.js apps.
- `biome.base.json` — lint and formatting rules. The repository-root `biome.json` extends this file.

A new package (for example `packages/ai` in 1.0) only uses `extends` and does not define its own rules.
