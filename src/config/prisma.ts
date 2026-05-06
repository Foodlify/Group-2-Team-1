import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";
import logger from "./logger";

const databaseUrl = process.env.DATABASE_URL;
const nodeEnv = process.env.NODE_ENV || "development";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// ─── Connection Pool ─────────────────────────────────
const pool = new Pool({
  connectionString: databaseUrl,
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
    nodeEnv === "development"
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
