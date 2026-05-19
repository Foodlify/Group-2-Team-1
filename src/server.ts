import app from "./app";
import env from "./config/env";
import logger from "./config/logger";
import { connectPrisma, disconnectPrisma } from "./config/prisma";

const startServer = async (): Promise<void> => {
  // ── Connect to DB First ─────────────────────────────
  await connectPrisma();

  // ── Start HTTP Server ───────────────────────────────
  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });

  // ── Graceful Shutdown ───────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.warn(`${signal} received. Shutting down gracefully...`);

    // Stop accepting new requests
    server.close(async () => {
      logger.info("HTTP server closed.");

      // Close DB connections
      await disconnectPrisma();

      process.exit(0);
    });

    // Force exit if shutdown takes too long (10 seconds)
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ── Unhandled Errors ────────────────────────────────
  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("Unhandled Rejection", { reason });
    shutdown("unhandledRejection");
  });

  process.on("uncaughtException", (error: Error) => {
    logger.error("Uncaught Exception", { message: error.message });
    shutdown("uncaughtException");
  });
};

// ── Bootstrap ─────────────────────────────────────────
startServer().catch((error) => {
  logger.error("Failed to start server", { error });
  process.exit(1);
});