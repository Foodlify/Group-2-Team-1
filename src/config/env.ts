import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
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
  // Optional refresh-token secret; falls back to JWT_SECRET in the JWT helper.
  JWT_REFRESH_SECRET: z.string().trim().optional(),
  JWT_ACCESS_EXPIRES: z.preprocess(
    (value) => (value === undefined || value === "" ? "15m" : value),
    z.string(),
  ),
  JWT_REFRESH_EXPIRES: z.preprocess(
    (value) => (value === undefined || value === "" ? "7d" : value),
    z.string(),
  ),
  // Comma-separated list of allowed CORS origins. Empty = reflect request
  // origin (dev convenience). Required for httpOnly-cookie auth from a browser.
  CORS_ORIGIN: z.string().trim().optional(),
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
