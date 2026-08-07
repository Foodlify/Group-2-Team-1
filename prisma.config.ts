import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Needed by `prisma migrate diff --from-migrations`, which replays the
    // migration folder into a scratch database to compare it against the
    // schema — that's the drift check in CI. Prisma 7 only reads it from here:
    // the `--shadow-database-url` flag its own error message suggests is not
    // accepted by the CLI's argument parser.
    // Unset outside CI, where the drift check simply isn't run.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
