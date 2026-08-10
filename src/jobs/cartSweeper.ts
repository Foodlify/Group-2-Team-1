import env from "../config/env";
import logger from "../config/logger";
import { cartService } from "../modules/cart/cart.service";

export const startCartSweeper = (): (() => void) => {
  const minutes = env.CART_SWEEP_INTERVAL_MINUTES;
  if (minutes === 0) {
    logger.info("Cart sweeper disabled (CART_SWEEP_INTERVAL_MINUTES=0)");
    return () => undefined;
  }

  const run = (): void => {
    void cartService.sweepAbandoned().catch((error: unknown) => {
      logger.error("Cart sweep failed", { error });
    });
  };

  const timer = setInterval(run, minutes * 60 * 1000);
  timer.unref();
  logger.info(`Cart sweeper started (every ${minutes} minutes)`);

  return () => clearInterval(timer);
};
