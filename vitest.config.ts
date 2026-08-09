import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests need a real PostgreSQL and run from their own config
    // (`npm run test:integration`). Keeping them out here is what lets
    // `npm test` stay runnable with no external service at all.
    exclude: ["node_modules/**", "tests/integration/**"],
    // Unit tests never touch a real database, but importing any service pulls
    // in `config/env` whose Zod schema requires these — dummies keep module
    // loading from failing inside the test worker.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      JWT_SECRET: "vitest-secret",
      // Blanked deliberately. `config/env` runs `dotenv.config()`, so without
      // these a developer who has real Stripe keys in `.env` gets a different
      // `SUPPORTED_PAYMENT_METHODS` — and a different test result — from one
      // who does not. Tests that need the configured branch stub it themselves
      // and re-import the module (see payment.service.unit.test.ts).
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
    },
    coverage: {
      provider: "v8",
      include: ["src/modules/**/*.ts"],
    },
  },
});
