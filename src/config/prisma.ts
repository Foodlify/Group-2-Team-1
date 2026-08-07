import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";
import env from "./env";
import logger from "./logger";

// ─── Connection Pool ─────────────────────────────────
// `env` is the single, validated source of configuration — DATABASE_URL is
// already guaranteed present/non-empty there, so no re-check is needed.
//
// `max` was 10, which load testing showed to be the app's first hard ceiling:
// at 500 concurrent customers every request past the tenth queued for a
// connection and then failed with "timeout exceeded when trying to connect"
// once `connectionTimeoutMillis` elapsed — 499 of them in a single run, all
// surfacing to the customer as a 500. See docs/LOAD_TESTING.md.
//
// It is configurable now because the right value is deployment-specific: it
// must be small enough that (instances x max) stays under the server's
// `max_connections`, and large enough to keep the event loop fed.
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
