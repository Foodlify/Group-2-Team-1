import type { Prisma } from "../../generated/prisma/client";
import type { TransactionModel } from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import logger from "../../config/logger";
import { paymentErrors } from "../../shared/exceptions/payment.errors";
import { transactionService } from "../transaction/transaction.service";
import type { PaymentMethod } from "../transaction/transaction.model";
import type {
  PaymentContextData,
  PaymentInitiation,
  PaymentStrategy,
} from "./payment.strategy";
import { cashOnDeliveryStrategy } from "./cash.strategy";
import { stripeCardStrategy } from "./stripe.strategy";
import { isStripeConfigured } from "./stripe.client";

class PaymentService {
  private strategies: Map<PaymentMethod, PaymentStrategy> = new Map();

  constructor() {
    this.register(cashOnDeliveryStrategy);
    // Registered only when Stripe is actually configured, which is the same
    // condition `SUPPORTED_PAYMENT_METHODS` uses to decide whether CREDIT_CARD
    // is a valid request value. Keeping both on one condition means the API
    // cannot advertise a method that has no strategy behind it.
    if (isStripeConfigured()) {
      this.register(stripeCardStrategy);
      logger.info("Stripe card payments enabled");
    }
  }

  register(strategy: PaymentStrategy) {
    this.strategies.set(strategy.method, strategy);
  }

  /**
   * Routes a payment to the strategy matching the given method, then
   * persists a Transaction record (PENDING/SUCCESS/FAILED) and returns it.
   * Pass `tx` to participate in the caller's database transaction.
   */
  async processPayment(
    method: PaymentMethod,
    amount: number,
    context: PaymentContextData,
    tx?: Prisma.TransactionClient,
  ) {
    const strategy = this.requireStrategy(method);

    const result = await strategy.pay(amount, context);

    return transactionService.createTransaction(
      {
        type: "ORDER_PAYMENT",
        amount,
        currency: context.currency,
        status: result.status,
        paymentMethod: method,
        externalRef: result.externalRef,
        orderId: context.orderId,
        metadata: result.metadata,
      },
      tx,
    );
  }

  /**
   * Second phase for gateway-backed methods: hands the payment off to the
   * provider and records the reference it returns.
   *
   * MUST be called after the checkout transaction has committed — see the note
   * on `PaymentStrategy.initiate`. Methods without a gateway return an empty
   * initiation, so the caller needs no branching.
   */
  async initiatePayment(
    method: PaymentMethod,
    transaction: TransactionModel,
    amount: number,
    context: PaymentContextData,
  ): Promise<PaymentInitiation> {
    const strategy = this.requireStrategy(method);
    if (!strategy.initiate) return {};

    const initiation = await strategy.initiate(transaction, amount, context);

    // Persisted immediately: the reference is what reconciles our ledger
    // against the provider's, and losing it means a payment we cannot trace.
    if (initiation.externalRef || initiation.metadata) {
      await transactionService.attachGatewayReference(transaction.id, {
        externalRef: initiation.externalRef,
        metadata: initiation.metadata,
      });
    }

    return initiation;
  }

  /** Methods with a registered strategy — the honest list of what works. */
  supportedMethods(): PaymentMethod[] {
    return [...this.strategies.keys()];
  }

  private requireStrategy(method: PaymentMethod): PaymentStrategy {
    const strategy = this.strategies.get(method);
    if (!strategy) {
      throw new AppError(
        paymentErrors.UNSUPPORTED_METHOD.message,
        paymentErrors.UNSUPPORTED_METHOD.statusCode,
      );
    }
    return strategy;
  }
}

export const paymentService = new PaymentService();
