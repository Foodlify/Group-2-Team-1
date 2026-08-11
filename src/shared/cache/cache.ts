import env from "../../config/env";
import logger from "../../config/logger";
import { getRedisClient } from "../../config/redis";

class Cache {
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClient();
    if (!client) return null;
    try {
      const raw = await client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      logger.warn("Cache read failed — falling back to the database", {
        key,
        error,
      });
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      await client.set(key, JSON.stringify(value), {
        expiration: {
          type: "EX",
          value: ttlSeconds ?? env.REDIS_CACHE_TTL_SECONDS,
        },
      });
    } catch (error) {
      logger.warn("Cache write failed", { key, error });
    }
  }

  async del(...keys: string[]): Promise<void> {
    const client = getRedisClient();
    if (!client || keys.length === 0) return;
    try {
      await client.del(keys);
    } catch (error) {
      logger.warn("Cache invalidation failed", { keys, error });
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;
    try {
      const keys: string[] = [];
      for await (const key of client.scanIterator({
        MATCH: `${prefix}*`,
        COUNT: 100,
      })) {
        keys.push(...(Array.isArray(key) ? key : [key]));
      }
      if (keys.length > 0) await client.del(keys);
    } catch (error) {
      logger.warn("Cache prefix invalidation failed", { prefix, error });
    }
  }
}

export const cache = new Cache();

export const cacheKeys = {
  cartOfCustomer: (customerId: string): string => `cart:customer:${customerId}`,
  cartOfGuest: (guestToken: string): string => `cart:guest:${guestToken}`,
  menu: (menuId: string): string => `menu:${menuId}`,
  menusPrefix: "menu:",
};
