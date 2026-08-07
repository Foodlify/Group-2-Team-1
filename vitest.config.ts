import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
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
