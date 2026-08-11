import { createClient, type RedisClientType } from "redis";
import env from "./env";
import logger from "./logger";

export const isRedisEnabled = (): boolean => Boolean(env.REDIS_URL);

let client: RedisClientType | null = null;

export const getRedisClient = (): RedisClientType | null => client;

export const connectRedis = async (): Promise<void> => {
  if (!env.REDIS_URL) {
    logger.info("Redis not configured (REDIS_URL unset) — caching disabled");
    return;
  }

  const redis: RedisClientType = createClient({ url: env.REDIS_URL });

  redis.on("error", (error: unknown) => {
    logger.error("Redis client error", { error });
  });

  try {
    await redis.connect();
    client = redis;
    logger.info("Redis connected successfully");
  } catch (error) {
    logger.error("Failed to connect to Redis — continuing without cache", {
      error,
    });
    client = null;
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (!client) return;
  try {
    await client.quit();
    logger.info("Redis disconnected successfully");
  } catch (error) {
    logger.error("Failed to disconnect from Redis", { error });
  } finally {
    client = null;
  }
};
