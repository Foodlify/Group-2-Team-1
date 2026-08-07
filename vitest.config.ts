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
    },
    coverage: {
      provider: "v8",
      include: ["src/modules/**/*.ts"],
    },
  },
});
