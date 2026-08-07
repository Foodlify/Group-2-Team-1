import { execFileSync } from "node:child_process";

/**
 * Brings the test database up to the current schema before any test runs.
 *
 * `migrate deploy` (not `migrate dev`) on purpose: it applies the committed
 * migration files exactly as production would and never invents new ones. That
 * makes this suite a live check that the migrations in git actually build the
 * schema the code expects — a drift that `prisma generate` alone cannot catch.
 */
export default function setup(): void {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
  });
}
