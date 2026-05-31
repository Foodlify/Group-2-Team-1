import express, { Application, Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { StatusCodes } from "http-status-codes";
import router from "./routes/index";
import { errorMiddleware } from "./middlewares/error.middleware";
import logger from "./config/logger";
import prisma from "./config/prisma";
import { serveOpenApi } from "./openapi/serve";

const app: Application = express();

// ── Middlewares ──────────────────────────────────────
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

// ── Routes ───────────────────────────────────────────
app.use("/api/v1", router);

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
