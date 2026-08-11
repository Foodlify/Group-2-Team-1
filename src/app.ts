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

app.set("trust proxy", env.TRUST_PROXY);

app.use(helmet());

app.use(
  "/api-docs",
  helmet.contentSecurityPolicy({
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      "connect-src": ["'self'", "https://cdn.jsdelivr.net"],

      "img-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
      "font-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],

      "upgrade-insecure-requests": null,
    },
  }),
);

app.use(
  cors({
    origin: env.CORS_ORIGIN
      ? env.CORS_ORIGIN.split(",").map((o) => o.trim())
      : true,
    credentials: true,
  }),
);

app.use((req: Request, res: Response, next: NextFunction): void => {
  runWithContext({ ip: req.ip, route: `${req.method} ${req.path}` }, next);
});

app.use("/api/v1/payments/stripe/webhook", paymentWebhookRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use((req: Request, res: Response, next: NextFunction): void => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

serveOpenApi(app);

if (env.NODE_ENV !== "production") {
  app.use(
    "/demo",
    express.static(path.join(__dirname, "..", "public", "demo")),
  );
}

app.use("/api/v1", apiLimiter, router);

app.get("/health", async (req: Request, res: Response): Promise<void> => {
  try {
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

app.use((req: Request, res: Response): void => {
  res
    .status(StatusCodes.NOT_FOUND)
    .json({ success: false, message: `Route ${req.url} not found` });
});

app.use(errorMiddleware);

export default app;
