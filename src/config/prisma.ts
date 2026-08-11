import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";
import env from "./env";
import logger from "./logger";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log:
    env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["error"],
});

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
