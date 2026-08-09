import type { Prisma } from "../../generated/prisma/client";
import type {
  PaymentMethod,
  TransactionStatus,
} from "../transaction/transaction.model";
import type { TransactionModel } from "../../generated/prisma/models";

export interface PaymentContextData {
  orderId: string;
  customerId: string;
  currency: string;
}

export interface PaymentResult {
  status: TransactionStatus;
  externalRef?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * What a gateway hand-off produced. `redirectUrl` is where the customer must
 * be sent to actually pay; it is transient and deliberately not persisted as a
 * column — once the session expires the URL is worthless.
 */
export interface PaymentInitiation {
  externalRef?: string;
  redirectUrl?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface PaymentStrategy {
  readonly method: PaymentMethod;

  /**
   * Records the payment's initial state. Runs INSIDE the checkout database
   * transaction, so it must stay local — no network calls. See `initiate`.
   */
  pay(amount: number, context: PaymentContextData): Promise<PaymentResult>;

  /**
   * Optional second phase, run AFTER the checkout transaction has committed.
   *
   * This is where external gateway calls belong. Talking to Stripe from inside
   * `pay` would hold the cart's row lock and a pooled connection open for the
   * whole HTTPS round-trip — the load tests showed what that costs: with only
   * `DATABASE_POOL_MAX` connections available, a few hundred concurrent
   * checkouts each parked on a ~300 ms external call exhaust the pool and every
   * later request fails waiting for one.
   *
   * Strategies without a gateway (cash on delivery) simply omit it.
   */
  initiate?(
    transaction: TransactionModel,
    amount: number,
    context: PaymentContextData,
  ): Promise<PaymentInitiation>;
}
