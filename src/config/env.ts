import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z
  .object({
    PORT: z.preprocess(
      (value) => (value === undefined || value === "" ? 4444 : value),
      z.coerce.number().int().min(1).max(65535),
    ),
    NODE_ENV: z.preprocess(
      (value) => (value === undefined || value === "" ? "development" : value),
      z.enum(["development", "test", "production"]),
    ),
    DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),

    DATABASE_POOL_MAX: z.preprocess(
      (value) => (value === undefined || value === "" ? 20 : value),
      z.coerce.number().int().positive(),
    ),
    JWT_SECRET: z.string().trim().min(1, "JWT_SECRET is required"),

    JWT_REFRESH_SECRET: z.string().trim().optional(),
    JWT_ACCESS_EXPIRES: z.preprocess(
      (value) => (value === undefined || value === "" ? "15m" : value),
      z.string(),
    ),
    JWT_REFRESH_EXPIRES: z.preprocess(
      (value) => (value === undefined || value === "" ? "7d" : value),
      z.string(),
    ),

    CORS_ORIGIN: z.string().trim().optional(),

    TRUST_PROXY: z.preprocess(
      (value) => (value === undefined || value === "" ? 0 : value),
      z.coerce.number().int().min(0),
    ),

    LOG_DIR: z.preprocess(
      (value) => (value === undefined ? "logs" : value),
      z.string(),
    ),

    SMTP_HOST: z.string().trim().optional(),
    SMTP_PORT: z.preprocess(
      (value) => (value === undefined || value === "" ? 587 : value),
      z.coerce.number().int().min(1).max(65535),
    ),
    SMTP_USER: z.string().trim().optional(),
    SMTP_PASS: z.string().optional(),

    MAIL_FROM: z.string().trim().optional(),

    STRIPE_SECRET_KEY: z.string().trim().optional(),

    STRIPE_WEBHOOK_SECRET: z.string().trim().optional(),

    STRIPE_SUCCESS_URL: z.preprocess(
      (value) =>
        value === undefined || value === ""
          ? "http://localhost:4444/payment/success"
          : value,
      z.url(),
    ),
    STRIPE_CANCEL_URL: z.preprocess(
      (value) =>
        value === undefined || value === ""
          ? "http://localhost:4444/payment/cancel"
          : value,
      z.url(),
    ),

    REDIS_URL: z.string().trim().optional(),
    REDIS_CACHE_TTL_SECONDS: z.preprocess(
      (value) => (value === undefined || value === "" ? 300 : value),
      z.coerce.number().int().positive(),
    ),

    GOOGLE_CLIENT_ID: z.string().trim().optional(),
    GOOGLE_CLIENT_SECRET: z.string().trim().optional(),

    GOOGLE_CALLBACK_URL: z.preprocess(
      (value) =>
        value === undefined || value === ""
          ? "http://localhost:4444/api/v1/auth/google/callback"
          : value,
      z.url(),
    ),

    GOOGLE_POST_LOGIN_REDIRECT: z.string().trim().optional(),

    VAPID_PUBLIC_KEY: z.string().trim().optional(),
    VAPID_PRIVATE_KEY: z.string().trim().optional(),

    VAPID_SUBJECT: z.preprocess(
      (value) =>
        value === undefined || value === ""
          ? "mailto:support@foodlify.example"
          : value,
      z.string().trim(),
    ),

    CART_GUEST_TTL_HOURS: z.preprocess(
      (value) => (value === undefined || value === "" ? 24 : value),
      z.coerce.number().int().positive(),
    ),
    CART_CUSTOMER_TTL_DAYS: z.preprocess(
      (value) => (value === undefined || value === "" ? 30 : value),
      z.coerce.number().int().positive(),
    ),

    CART_SWEEP_INTERVAL_MINUTES: z.preprocess(
      (value) => (value === undefined || value === "" ? 60 : value),
      z.coerce.number().int().nonnegative(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.STRIPE_SECRET_KEY && !data.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_WEBHOOK_SECRET"],
        message:
          "STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set",
      });
    }

    if (Boolean(data.GOOGLE_CLIENT_ID) !== Boolean(data.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_SECRET"],
        message:
          "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together, or neither",
      });
    }

    if (Boolean(data.VAPID_PUBLIC_KEY) !== Boolean(data.VAPID_PRIVATE_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["VAPID_PRIVATE_KEY"],
        message:
          "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together, or neither",
      });
    }

    if (data.NODE_ENV !== "production") return;

    if (!data.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_REFRESH_SECRET"],
        message: "JWT_REFRESH_SECRET is required in production",
      });
    }
    if (!data.CORS_ORIGIN) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN is required in production",
      });
    }
  });

export type EnvConfig = z.infer<typeof EnvSchema>;

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const errors = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${errors}`);
}

const env: EnvConfig = parsedEnv.data;

export default env;
