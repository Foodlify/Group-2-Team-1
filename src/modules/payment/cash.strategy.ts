import type {
  PaymentContextData,
  PaymentResult,
  PaymentStrategy,
} from "./payment.strategy";

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
