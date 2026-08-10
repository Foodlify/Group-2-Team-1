import app from "./app";
import env from "./config/env";
import logger from "./config/logger";
import { connectPrisma, disconnectPrisma } from "./config/prisma";
import { connectRedis, disconnectRedis } from "./config/redis";
import { startCartSweeper } from "./jobs/cartSweeper";

/**
 * The addresses worth having in front of you the moment the server is up.
 *
 * Built from `env.PORT` rather than written down, because the port lives in
 * `.env` and a banner that hardcodes one is a banner that lies the first time
 * somebody changes it. Printed only after `listen` succeeds — a URL shown
 * before the bind is a URL that may never answer.
 */
const startupLinks = (): string => {
  const base = `http://localhost:${env.PORT}`;
  const rows: Array<[string, string]> = [
    ["API", `${base}/api/v1`],
    ["Docs", `${base}/api-docs`],
    // Swagger is listed beside Scalar rather than treated as an implementation
    // detail: it renders the same document from this origin with no CDN, so it
    // is the one that still works offline, behind a proxy, or on the day
    // jsdelivr is having a bad afternoon. Worth being able to reach without
    // having to remember the path.
    ["Swagger", `${base}/api-docs/swagger/`],
    ["Health", `${base}/health`],
  ];
  // The demo page only exists outside production, so linking to it there would
  // be pointing at a 404.
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

  // ── Connect to DB First ─────────────────────────────
  await connectPrisma();

  // ── Cache (optional — never fatal) ──────────────────
  await connectRedis();

  // ── Background Jobs ─────────────────────────────────
  const stopCartSweeper = startCartSweeper();

  // ── Start HTTP Server ───────────────────────────────
  const server = app.listen(env.PORT, () => {
    // The trailing newline is not decoration: the console transport appends
    // its metadata blob straight after the message, which would otherwise sit
    // glued to the end of the last URL — the one line here anybody actually
    // wants to click.
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

  // ── Graceful Shutdown ───────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.warn(`${signal} received. Shutting down gracefully...`);

    stopCartSweeper();

    // Stop accepting new requests
    server.close(async () => {
      logger.info("HTTP server closed.");

      // Close DB + cache connections
      await disconnectPrisma();
      await disconnectRedis();

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
