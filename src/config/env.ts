import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z
  .object({
    PORT: z.preprocess(
      (value) => (value === undefined || value === "" ? 3000 : value),
      z.coerce.number().int().min(1).max(65535),
    ),
    NODE_ENV: z.preprocess(
      (value) => (value === undefined || value === "" ? "development" : value),
      z.enum(["development", "test", "production"]),
    ),
    DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().trim().min(1, "JWT_SECRET is required"),
    // Dedicated refresh-token secret. Falls back to JWT_SECRET in dev for
    // convenience, but is REQUIRED in production (enforced in superRefine below).
    JWT_REFRESH_SECRET: z.string().trim().optional(),
    JWT_ACCESS_EXPIRES: z.preprocess(
      (value) => (value === undefined || value === "" ? "15m" : value),
      z.string(),
    ),
    JWT_REFRESH_EXPIRES: z.preprocess(
      (value) => (value === undefined || value === "" ? "7d" : value),
      z.string(),
    ),
    // Comma-separated allowlist of CORS origins. Empty = reflect request origin
    // (dev convenience only). REQUIRED in production (enforced in superRefine
    // below) because the app authenticates via httpOnly cookies + credentials.
    CORS_ORIGIN: z.string().trim().optional(),
    // ── SMTP (OTP emails) ── all optional: when SMTP_HOST is unset the mailer
    // logs messages instead of sending (dev/test) and refuses in production.
    SMTP_HOST: z.string().trim().optional(),
    SMTP_PORT: z.preprocess(
      (value) => (value === undefined || value === "" ? 587 : value),
      z.coerce.number().int().min(1).max(65535),
    ),
    SMTP_USER: z.string().trim().optional(),
    SMTP_PASS: z.string().optional(),
    // Sender address for outgoing mail; falls back to SMTP_USER.
    MAIL_FROM: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== "production") return;
    // Fail fast at boot rather than silently shipping insecure defaults.
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
