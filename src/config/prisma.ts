import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";
import env from "./env";
import logger from "./logger";

// ─── Connection Pool ─────────────────────────────────
// `env` is the single, validated source of configuration — DATABASE_URL is
// already guaranteed present/non-empty there, so no re-check is needed.
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
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
