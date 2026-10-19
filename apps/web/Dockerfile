# syntax=docker/dockerfile:1
#
# UpworkCoach web (Next.js standalone) — one image for Azure App Service, an Iranian VPS
# or any Linux host (ADR-0001, ADR-0002). Build from the REPO ROOT:
#
#   docker build -f apps/web/Dockerfile -t upworkcoach-web .
#   docker build -f apps/web/Dockerfile --target migrator -t upworkcoach-migrate .
#
# NOTE: not yet built or run — Docker is not installed on the founder's dev machine
# (ADR-0009). The first real build happens in CI or on the deployment host.

ARG NODE_VERSION=24

# ---- base: Node 24 LTS + pinned pnpm (installed inside the image only) ----------
FROM node:${NODE_VERSION}-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.14.0
WORKDIR /app

# ---- deps: install from the lockfile only (better layer caching) ----------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# ---- build ----------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm --filter @upworkcoach/web build

# ---- migrator: one-off container that applies SQL migrations, then exits ---------
FROM build AS migrator
ENV NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@upworkcoach/web", "db:migrate"]

# ---- runner: minimal runtime image ----------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
# Writable directory for STORAGE_DRIVER=local (mount a volume here).
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz > /dev/null || exit 1
CMD ["node", "apps/web/server.js"]
