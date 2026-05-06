# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=25.8.1

# ── Base ──────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init libc6-compat openssl

# ── Dependencies (full) ───────────────────────────────
FROM base AS deps
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ── Build ─────────────────────────────────────────────
FROM deps AS build
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ── Production Dependencies ───────────────────────────
FROM base AS prod-deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts

# ── Runtime ───────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./

RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app
USER app

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
