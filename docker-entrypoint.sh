#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "==> Applying database migrations"
  node node_modules/prisma/build/index.js migrate deploy
  echo "==> Migrations up to date"
else
  echo "==> RUN_MIGRATIONS=false — skipping migrations"
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "==> Seeding database"
  node dist/scripts/seed.js
  echo "==> Seed complete"
fi

exec "$@"
