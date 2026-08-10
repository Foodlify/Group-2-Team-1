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
    // Postgres connections held by this instance. Keep `instances x this`
    // below the server's `max_connections` (100 by default). See the load
    // testing notes — 10 was the first ceiling the app hit under concurrency.
    DATABASE_POOL_MAX: z.preprocess(
      (value) => (value === undefined || value === "" ? 20 : value),
      z.coerce.number().int().positive(),
    ),
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
    // Number of reverse proxies between the internet and this process, and the
    // only thing that decides who the rate limiter thinks a client is.
    //
    // 0 (the default) means directly exposed: `req.ip` is the socket address.
    // Behind a proxy that is the *proxy's* address for everybody, so the limits
    // stop being per-client and become one shared cap on the whole service —
    // measured, not assumed: 20 different customers exhaust the auth limit and
    // the 21st is refused (tests/middleware/rateLimit.unit.test.ts).
    //
    // Set it to the number of hops you actually run, not to a blanket "trust
    // everything": with an untrusted hop counted, a client can prepend its own
    // `X-Forwarded-For` and mint a fresh identity per request, which turns the
    // limiter off just as effectively.
    TRUST_PROXY: z.preprocess(
      (value) => (value === undefined || value === "" ? 0 : value),
      z.coerce.number().int().min(0),
    ),
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
    // ── Stripe (card payments) ── all optional: when STRIPE_SECRET_KEY is
    // unset the card strategy is never registered, so `CREDIT_CARD` is absent
    // from the advertised payment methods and the API stays honest about what
    // it can actually process. Same "configure it or it doesn't exist" rule the
    // mailer and the cache follow.
    STRIPE_SECRET_KEY: z.string().trim().optional(),
    // Signs the webhook payload. Without it we cannot tell a genuine Stripe
    // callback from anyone on the internet POSTing to the endpoint, so the
    // webhook refuses every request rather than trusting the body.
    STRIPE_WEBHOOK_SECRET: z.string().trim().optional(),
    // Where Stripe returns the customer after the hosted checkout page.
    STRIPE_SUCCESS_URL: z.preprocess(
      (value) =>
        value === undefined || value === ""
          ? "http://localhost:3000/payment/success"
          : value,
      z.url(),
    ),
    STRIPE_CANCEL_URL: z.preprocess(
      (value) =>
        value === undefined || value === ""
          ? "http://localhost:3000/payment/cancel"
          : value,
      z.url(),
    ),
    // ── Redis (cache) ── optional: unset means caching is simply disabled,
    // the app still serves everything from PostgreSQL.
    REDIS_URL: z.string().trim().optional(),
    REDIS_CACHE_TTL_SECONDS: z.preprocess(
      (value) => (value === undefined || value === "" ? 300 : value),
      z.coerce.number().int().positive(),
    ),
    // ── Abandoned-cart housekeeping ──
    // A guest cart is disposable; a signed-in customer's cart is saved state,
    // so it gets a much longer grace period.
    CART_GUEST_TTL_HOURS: z.preprocess(
      (value) => (value === undefined || value === "" ? 24 : value),
      z.coerce.number().int().positive(),
    ),
    CART_CUSTOMER_TTL_DAYS: z.preprocess(
      (value) => (value === undefined || value === "" ? 30 : value),
      z.coerce.number().int().positive(),
    ),
    // How often the sweeper runs. 0 disables it (the admin endpoint still works).
    CART_SWEEP_INTERVAL_MINUTES: z.preprocess(
      (value) => (value === undefined || value === "" ? 60 : value),
      z.coerce.number().int().nonnegative(),
    ),
  })
  .superRefine((data, ctx) => {
    // Not production-only: a card payment whose webhook can never be verified
    // stays PENDING forever and the reserved stock is never released. Better to
    // refuse to boot than to take money we cannot confirm.
    if (data.STRIPE_SECRET_KEY && !data.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_WEBHOOK_SECRET"],
        message:
          "STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set",
      });
    }

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
