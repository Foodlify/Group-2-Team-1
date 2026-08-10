# syntax=docker/dockerfile:1.7

# Node 24 is the active LTS line. Pinned to the patch: "24-alpine" would move
# under the image without the repository recording that it did, which is the
# one thing a lock file exists to prevent.
ARG NODE_VERSION=24.19.0

# ── Base ──────────────────────────────────────────────
# The unprivileged user is created here, while /app is still empty. Creating it
# in the runtime stage and then running `chown -R /app` costs a duplicate copy
# of every file in a new layer — 441MB of it, measured, on an image this size.
# `COPY --chown` sets the ownership as the files land instead, for free.
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init libc6-compat openssl \
    && addgroup -S app && adduser -S app -G app

# ── Dependencies (full) ───────────────────────────────
# `npm ci` runs the postinstall hook, which is `prisma generate` — that is what
# writes src/generated/prisma. The placeholder DATABASE_URL is only there to
# satisfy prisma.config.ts while generating; generation never connects.
FROM base AS deps
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ── Build ─────────────────────────────────────────────
# `-p tsconfig.build.json` is not optional. The root tsconfig has no `outDir`
# and includes tests: a bare `tsc` writes .js files next to the sources, never
# creates dist/, and the runtime stage below fails on a COPY of a path that
# does not exist.
FROM deps AS build
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json

# ── Production Dependencies ───────────────────────────
# `--ignore-scripts` skips the postinstall, so the Prisma client is NOT
# generated here. It does not need to be: the generated client is TypeScript
# under src/generated, so the build stage above compiled it into dist/.
#
# The Prisma CLI arrives anyway, and is meant to: in Prisma 7 `@prisma/client`
# depends on `prisma`, so `migrate deploy` is available in a production install
# without promoting anything out of devDependencies.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ── Runtime ───────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
# Stdout only by default — the container platform already collects it, and a
# second copy inside the container's own filesystem is a second copy nobody
# reads. Set LOG_DIR=/app/logs and mount a volume there to keep files instead.
ENV LOG_DIR=""

# Created and owned all the same, so setting LOG_DIR works whether or not a
# volume is mounted over it. An empty directory costs nothing; the process
# dying at boot because it cannot mkdir in a root-owned WORKDIR costs a deploy.
RUN mkdir -p /app/logs && chown app:app /app/logs

COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app prisma ./prisma
COPY --chown=app:app prisma.config.ts package.json ./
COPY --chown=app:app --chmod=755 docker-entrypoint.sh ./

USER app

EXPOSE 3000

# Asks the app the same question a load balancer would. /health runs a real
# query, so an unreachable database marks the container unhealthy rather than
# leaving it to serve 503s to everyone who asks.
#
# `start-period` is generous because the first start of a deploy also applies
# migrations, and a container killed halfway through one is the worst possible
# moment to be killed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
