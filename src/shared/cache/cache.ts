import env from "../../config/env";
import logger from "../../config/logger";
import { getRedisClient } from "../../config/redis";

/**
 * Thin cache-aside helper over Redis.
 *
 * Two rules the rest of the code depends on:
 * 1. **Never throws.** A cache miss and a cache outage look identical to
 *    callers, so a Redis problem degrades performance, never correctness.
 * 2. **Never the source of truth.** Reads fall back to the database and
 *    writes invalidate the key rather than trying to patch it.
 */
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

  /**
   * Invalidates a whole key family (e.g. every cached menu of a restaurant).
   * Uses SCAN, not KEYS — KEYS blocks the Redis event loop for the whole scan.
   */
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

/** Key builders — one place, so a rename can't leave stale keys behind. */
export const cacheKeys = {
  cartOfCustomer: (customerId: string): string => `cart:customer:${customerId}`,
  cartOfGuest: (guestToken: string): string => `cart:guest:${guestToken}`,
  menu: (menuId: string): string => `menu:${menuId}`,
  menusPrefix: "menu:",
};
