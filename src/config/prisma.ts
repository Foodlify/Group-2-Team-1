import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import env from "./env";
import logger from "./logger";

// ─── Adapter ────────────────────────────────────────
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

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