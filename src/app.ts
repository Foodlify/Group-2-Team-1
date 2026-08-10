import express, { Application, Request, Response, NextFunction } from "express";
import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { StatusCodes } from "http-status-codes";
import router from "./routes/index";
import { paymentWebhookRouter } from "./modules/payment/payment.routes";
import { errorMiddleware } from "./middlewares/error.middleware";
import { apiLimiter } from "./middlewares/rateLimit.middleware";
import logger from "./config/logger";
import prisma from "./config/prisma";
import env from "./config/env";
import { serveOpenApi } from "./openapi/serve";
import { runWithContext } from "./shared/context/request.context";

const app: Application = express();

// ── Client identity ──────────────────────────────────
// How many proxy hops to believe when working out `req.ip`. This is what the
// rate limiter counts by, so getting it wrong breaks the limiter in one of two
// directions: too low and every customer shares one bucket (behind a load
// balancer, 20 logins per 15 minutes for the entire service); too high and a
// client can forge `X-Forwarded-For` to get a fresh bucket per request.
// Defaults to 0 — directly exposed — because that is the only safe assumption
// to make on someone else's behalf.
app.set("trust proxy", env.TRUST_PROXY);

// ── Middlewares ──────────────────────────────────────
// Security headers first so every response (including errors) carries them.
app.use(helmet());
// CORS with credentials so browsers send/receive the httpOnly auth cookies.
// `CORS_ORIGIN` (comma-separated) restricts origins in production; when unset
// we reflect the request origin (dev convenience).
app.use(
  cors({
    origin: env.CORS_ORIGIN
      ? env.CORS_ORIGIN.split(",").map((o) => o.trim())
      : true,
    credentials: true,
  }),
);
// ── Request context ──────────────────────────────────
// Opens the async-local store that carries the audit actor. Mounted here, ahead
// of the webhook and every route, so that a request which never authenticates
// still records its ip and route — a Stripe callback has no user, but "which
// endpoint, from which address" is most of what makes the entry useful.
// `req.ip` is only trustworthy because `trust proxy` was set above.
app.use((req: Request, res: Response, next: NextFunction): void => {
  runWithContext({ ip: req.ip, route: `${req.method} ${req.path}` }, next);
});

// The Stripe webhook is mounted BEFORE the JSON parser and outside the
// rate-limited `/api/v1` router — see the note in payment.routes.ts. Its
// signature check needs the raw bytes, which `express.json()` would consume.
app.use("/api/v1/payments/stripe/webhook", paymentWebhookRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Request Logger ───────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction): void => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// ── OpenAPI Documentation ─────────────────────────────
serveOpenApi(app);

// ── Web Push demo page (non-production) ───────────────
// A service worker only registers on a secure origin, and localhost counts —
// so the one place this page can work without TLS is served by the API itself.
// It exists because push is otherwise unprovable from a backend: there is no
// way to show a notification arriving without something that subscribes.
//
// Never in production: it is a development tool, not part of the product, and
// nothing should be able to reach it on a real deployment.
if (env.NODE_ENV !== "production") {
  app.use(
    "/push-demo",
    express.static(path.join(__dirname, "..", "public", "push-demo")),
  );
}

// ── Routes ───────────────────────────────────────────
// General-purpose rate limit as a safety net across the whole API.
app.use("/api/v1", apiLimiter, router);

// ── Health Check ─────────────────────────────────────
app.get("/health", async (req: Request, res: Response): Promise<void> => {
  try {
    // Verify DB connection by running a trivial query
    await prisma.$queryRaw`SELECT 1`;

    res.status(StatusCodes.OK).json({
      status: "OK",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Health check failed", { error });
    res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
      status: "DEGRADED",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});

// ── 404 Handler ──────────────────────────────────────
app.use((req: Request, res: Response): void => {
  res
    .status(StatusCodes.NOT_FOUND)
    .json({ success: false, message: `Route ${req.url} not found` });
});

// ── Error Middleware ─────────────────────────────────
app.use(errorMiddleware);

export default app;
