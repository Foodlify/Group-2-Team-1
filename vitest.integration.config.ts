import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// `.env.test` first (a developer's local test database), falling back to
// whatever is already exported — which is how CI supplies it.
dotenv.config({ path: ".env.test", quiet: true });

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error(
    "DATABASE_URL_TEST is not set.\n" +
      "Integration tests need a real PostgreSQL — see .env.test.example.\n" +
      "Unit tests need nothing: run `npm test` instead.",
  );
}

// The suite TRUNCATEs every table between tests. Pointing it at a development
// database would wipe it, so the database name must say what it is.
const database = url.split("/").pop()?.split("?")[0] ?? "";
if (!/test/i.test(database)) {
  throw new Error(
    `Refusing to run: DATABASE_URL_TEST points at "${database}", whose name ` +
      `does not contain "test". These tests truncate every table.`,
  );
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/globalSetup.ts"],
    // One database, one connection pool: files sharing it in parallel would
    // truncate each other's rows mid-test. Sequential is the correct
    // trade-off here — the suite is small and the isolation is absolute.
    fileParallelism: false,
    // Migrations run once up front; the first file also pays connection setup.
    hookTimeout: 60_000,
    testTimeout: 20_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: url,
      JWT_SECRET: "integration-secret",
      // Blanked for the same reason the unit config blanks them: whether a
      // developer happens to have Stripe or SMTP keys in `.env` must not
      // change what the suite asserts. A test that passes only on the machine
      // that configured a provider is worse than no test.
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      SMTP_HOST: "",
    },
  },
});
