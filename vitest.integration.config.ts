import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import webpush from "web-push";

dotenv.config({ path: ".env.test", quiet: true });

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error(
    "DATABASE_URL_TEST is not set.\n" +
      "Integration tests need a real PostgreSQL — see .env.test.example.\n" +
      "Unit tests need nothing: run `npm test` instead.",
  );
}

const database = url.split("/").pop()?.split("?")[0] ?? "";
if (!/test/i.test(database)) {
  throw new Error(
    `Refusing to run: DATABASE_URL_TEST points at "${database}", whose name ` +
      `does not contain "test". These tests truncate every table.`,
  );
}

const vapid = webpush.generateVAPIDKeys();

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/globalSetup.ts"],

    fileParallelism: false,

    hookTimeout: 60_000,
    testTimeout: 20_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: url,
      JWT_SECRET: "integration-secret",

      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      SMTP_HOST: "",
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,

      GOOGLE_CLIENT_ID: "integration-client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "integration-client-secret",
    },
  },
});
