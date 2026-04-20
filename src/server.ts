import app from "./app";
import env from "./config/env";
import logger from "./config/logger";

const startServer = (): void => {
  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });

  // ── Graceful Shutdown ──────────────────────────────
  const shutdown = (signal: string): void => {
    logger.warn(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      logger.info("Server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ── Unhandled Errors ───────────────────────────────
  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("Unhandled Rejection", { reason });
    shutdown("unhandledRejection");
  });

  process.on("uncaughtException", (error: Error) => {
    logger.error("Uncaught Exception", { message: error.message });
    shutdown("uncaughtException");
  });
};

startServer();
