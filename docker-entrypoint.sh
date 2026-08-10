#!/bin/sh
# Applies pending migrations, then hands over to the command.
#
# Why the container does this itself rather than a separate deploy step: on a
# platform that builds one image and runs it, there is no other moment that is
# guaranteed to happen. A migration step somebody has to remember to configure
# is a migration step that gets skipped on the deploy where it mattered.
#
# `migrate deploy` is the deployment-safe one: it applies what is pending and
# nothing else. It never generates, never resets, and never prompts — unlike
# `migrate dev`, which will happily offer to drop the database.
#
# Concurrency is Prisma's problem, not ours: it takes a PostgreSQL advisory
# lock, so a second replica starting at the same second waits rather than
# racing.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "==> Applying database migrations"
  # Invoked by path rather than through node_modules/.bin, so it does not
  # depend on a symlink surviving the copy between build stages.
  node node_modules/prisma/build/index.js migrate deploy
  echo "==> Migrations up to date"
else
  echo "==> RUN_MIGRATIONS=false — skipping migrations"
fi

# `exec` so the app becomes PID 1's direct child and receives SIGTERM itself.
# Without it this shell would hold the signal and the graceful shutdown in
# server.ts — closing the HTTP server, Prisma and Redis — would never run.
exec "$@"
