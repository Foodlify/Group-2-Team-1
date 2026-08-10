import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";
import env from "./env";
import logger from "./logger";

// ─── Connection Pool ─────────────────────────────────
// `env` is the single, validated source of configuration — DATABASE_URL is
// already guaranteed present/non-empty there, so no re-check is needed.
//
// `max` defaults to 20, and that number is measured rather than guessed —
// swept from 5 to 80 against the order-flow plan (docs/LOAD_TESTING.md):
//
//   - There is a near-binary cliff between 8 and 10: 8 connections serve 31%
//     of requests, 10 serve 100%.
//   - Above 10 there is no throughput gain at all, and the tail gets worse —
//     place-order p95 goes 102 ms at 10, 193 ms at 20, 329 ms at 80, as more
//     concurrent connections contend inside PostgreSQL.
//   - So 20 is a deliberate trade: twice the margin over the measured cliff,
//     for about 90 ms of p95. Do not go below 12; do not bother above 20.
//
// It stays configurable because the right value is deployment-specific:
// (instances x max) must stay under the server's `max_connections`, and a
// workload with longer-held connections than checkout — the dashboard reports
// run raw aggregates — should be re-measured rather than assumed.
//
// An earlier run blamed `max: 10` for 499 connection timeouts. That was the
// blocked event loop of `bcryptjs`, which could not run the callbacks that
// release connections; the same pool size now serves the same flow with zero.
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ─── Adapter ────────────────────────────────────────
const adapter = new PrismaPg(pool);

// ─── Prisma Client Singleton ────────────────────────
const prisma = new PrismaClient({
  adapter,
  log:
    env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["error"],
});

// ─── Connection Management ──────────────────────────
export const connectPrisma = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info("Database connected successfully");
  } catch (error) {
    logger.error("Failed to connect to database", { error });
    throw error;
  }
};

export const disconnectPrisma = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info("Database disconnected successfully");
  } catch (error) {
    logger.error("Failed to disconnect from database", { error });
  }
};

export default prisma;
