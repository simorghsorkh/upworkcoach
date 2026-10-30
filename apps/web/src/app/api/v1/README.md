# /api/v1 — REST API

Each endpoint is a thin `route.ts`: authentication → zod validation → call the module's `service` → DTO.
Business logic and access checks live inside the service (tech-stack.md section 3). Contract: `docs/04-architecture/api.md`.
