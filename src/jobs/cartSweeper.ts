import env from "../config/env";
import logger from "../config/logger";
import { cartService } from "../modules/cart/cart.service";

/**
 * Periodic abandoned-cart cleanup. Deliberately a plain `setInterval` rather
 * than a scheduler dependency — one process, one job, no coordination needed
 * at this scale, and nothing new to install or operate.
 *
 * `unref()` keeps the timer from holding the process open, and the returned
 * stop function is called during graceful shutdown. Set
 * `CART_SWEEP_INTERVAL_MINUTES=0` to disable it (the admin endpoint still works).
 */
export const startCartSweeper = (): (() => void) => {
  const minutes = env.CART_SWEEP_INTERVAL_MINUTES;
  if (minutes === 0) {
    logger.info("Cart sweeper disabled (CART_SWEEP_INTERVAL_MINUTES=0)");
    return () => undefined;
  }

  const run = (): void => {
    // A failed sweep must never take the process down — log and try again
    // at the next tick.
    void cartService.sweepAbandoned().catch((error: unknown) => {
      logger.error("Cart sweep failed", { error });
    });
  };

  const timer = setInterval(run, minutes * 60 * 1000);
  timer.unref();
  logger.info(`Cart sweeper started (every ${minutes} minutes)`);

  return () => clearInterval(timer);
};
