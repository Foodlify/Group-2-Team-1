import express, { Application, Request, Response, NextFunction } from "express";
import router from "./routes/index";
import { errorMiddleware } from "./middlewares/error.middleware";
import logger from "./config/logger";

const app: Application = express();

// ── Middlewares ──────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request Logger ───────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction): void => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// ── Routes ───────────────────────────────────────────
app.use("/api/v1", router);

// ── Health Check ─────────────────────────────────────
app.get("/health", (req: Request, res: Response): void => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// ── 404 Handler ──────────────────────────────────────
app.use((req: Request, res: Response): void => {
  res
    .status(404)
    .json({ success: false, message: `Route ${req.url} not found` });
});

// ── Error Middleware ─────────────────────────────────
app.use(errorMiddleware);

export default app;
