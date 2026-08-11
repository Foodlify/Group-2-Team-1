import app from "./app";
import env from "./config/env";
import logger from "./config/logger";
import { connectPrisma, disconnectPrisma } from "./config/prisma";
import { connectRedis, disconnectRedis } from "./config/redis";
import { startCartSweeper } from "./jobs/cartSweeper";

const startupLinks = (): string => {
  const base = `http://localhost:${env.PORT}`;
  const rows: Array<[string, string]> = [
    ["API", `${base}/api/v1`],
    ["Docs", `${base}/api-docs`],

    ["Swagger", `${base}/api-docs/swagger/`],
    ["Health", `${base}/health`],
  ];

  if (env.NODE_ENV !== "production") {
    rows.push(["Demo", `${base}/demo/`]);
  }
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows
    .map(([label, url]) => `   ${label.padEnd(width)}  ${url}`)
    .join("\n");
};

const startServer = async (): Promise<void> => {
  let isShuttingDown = false;

  await connectPrisma();

  await connectRedis();

  const stopCartSweeper = startCartSweeper();

  const server = app.listen(env.PORT, () => {
    logger.info(
      `Server running on port ${env.PORT} in ${env.NODE_ENV} mode\n` +
        `${startupLinks()}\n`,
    );
  });

  server.on("error", (error: Error) => {
    logger.error("HTTP server error", {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.warn(`${signal} received. Shutting down gracefully...`);

    stopCartSweeper();

    server.close(async () => {
      logger.info("HTTP server closed.");

      await disconnectPrisma();
      await disconnectRedis();

      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("Unhandled Rejection", { reason });
    shutdown("unhandledRejection");
  });

  process.on("uncaughtException", (error: Error) => {
    logger.error("Uncaught Exception", { message: error.message });
    shutdown("uncaughtException");
  });
};

startServer().catch((error) => {
  logger.error("Failed to start server", { error });
  process.exit(1);
});
