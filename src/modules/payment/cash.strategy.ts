import type {
  PaymentContextData,
  PaymentResult,
  PaymentStrategy,
} from "./payment.strategy";

/**
 * Cash-on-delivery: no external gateway. The transaction stays PENDING
 * until the courier collects payment, at which point it transitions to
 * SUCCESS (handled elsewhere — e.g. when order status moves to DELIVERED).
 */
export class CashOnDeliveryStrategy implements PaymentStrategy {
  readonly method = "CASH" as const;

  async pay(
    _amount: number,
    _context: PaymentContextData,
  ): Promise<PaymentResult> {
    return {
      status: "PENDING",
      metadata: { collectedAt: "delivery" },
    };
  }
}

export const cashOnDeliveryStrategy = new CashOnDeliveryStrategy();
