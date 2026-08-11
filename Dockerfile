# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.19.0

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init libc6-compat openssl \
    && addgroup -S app && adduser -S app -G app

FROM base AS deps
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
ENV NODE_ENV=development
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --include=dev

FROM deps AS build
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
ENV NODE_ENV=development
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=4444
ENV LOG_DIR=""

RUN mkdir -p /app/logs && chown app:app /app/logs

COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app prisma ./prisma
COPY --chown=app:app prisma.config.ts package.json ./
COPY --chown=app:app --chmod=755 docker-entrypoint.sh ./

USER app

EXPOSE 4444

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4444)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
