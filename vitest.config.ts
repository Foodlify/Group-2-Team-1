import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],

    exclude: ["node_modules/**", "tests/integration/**"],

    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      JWT_SECRET: "vitest-secret",

      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
    },
    coverage: {
      provider: "v8",
      include: ["src/modules/**/*.ts"],
    },
  },
});
