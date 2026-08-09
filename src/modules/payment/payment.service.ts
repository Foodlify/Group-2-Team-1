import type { Prisma } from "../../generated/prisma/client";
import type { TransactionModel } from "../../generated/prisma/models";
import { AppError, appError } from "../../middlewares/error.middleware";
import logger from "../../config/logger";
import { paymentErrors } from "../../shared/exceptions/payment.errors";
import { describeError } from "../../shared/errors/describe";
import {
  transactionService,
  type PendingGatewayRefund,
} from "../transaction/transaction.service";
import type { PaymentMethod } from "../transaction/transaction.model";
import type {
  PaymentContextData,
  PaymentInitiation,
  PaymentStrategy,
} from "./payment.strategy";
import { cashOnDeliveryStrategy } from "./cash.strategy";
import { stripeCardStrategy } from "./stripe.strategy";
import { isStripeConfigured } from "./stripe.client";
import type { TransactionResponse } from "./payment.validation";

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

  /**
   * Executes refunds against the gateway that took the money, and records what
   * came back. MUST be called after the cancelling transaction has committed.
   *
   * A refund that fails is marked FAILED and logged rather than thrown: the
   * cancellation itself already succeeded and is correct — the order is gone
   * and the stock is back — so failing the customer's request now would report
   * something untrue. What must never happen is the failure going unrecorded,
   * because a FAILED REFUND row is money this business still owes someone.
   */
  async refundPayments(refunds: PendingGatewayRefund[]): Promise<void> {
    for (const { refund, payment } of refunds) {
      const strategy = this.strategies.get(payment.paymentMethod);
      if (!strategy?.refund) {
        // The method that took the money no longer has a strategy — the key
        // was removed, or the payment predates it. Nobody can return this
        // automatically, so say so loudly instead of leaving it PENDING.
        logger.error("No refund strategy for a settled payment", {
          transactionId: refund.id,
          orderId: refund.orderId,
          method: payment.paymentMethod,
        });
        await transactionService.recordGatewayOutcome(refund.id, "FAILED", {
          metadata: { error: "no refund strategy for this payment method" },
        });
        continue;
      }

      try {
        const outcome = await strategy.refund(
          refund,
          payment,
          Number(refund.amount),
        );
        await transactionService.recordGatewayOutcome(
          refund.id,
          outcome.status,
          {
            externalRef: outcome.externalRef,
            metadata: outcome.metadata,
          },
        );
        logger.info("Refund sent to the gateway", {
          transactionId: refund.id,
          orderId: refund.orderId,
          status: outcome.status,
          externalRef: outcome.externalRef,
        });
      } catch (error) {
        logger.error("Gateway refund failed — money is still owed", {
          transactionId: refund.id,
          orderId: refund.orderId,
          amount: String(refund.amount),
          ...describeError(error),
        });
        try {
          await transactionService.recordGatewayOutcome(refund.id, "FAILED", {
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
        } catch (writeError) {
          // Last resort. If even this write fails the row stays PENDING, which
          // still reads as "unfinished" rather than "done" — the safe way to
          // be wrong.
          logger.error("Could not record the failed refund", {
            transactionId: refund.id,
            ...describeError(writeError),
          });
        }
      }
    }
  }

  /**
   * Retries one unsettled refund against its gateway.
   *
   * Deliberately manual — there is no timer that does this. Sending customers'
   * money back automatically, on a schedule, with nobody looking, is not a
   * decision a cron job should be making; a failed refund usually means
   * something is wrong that a retry alone will not fix.
   *
   * Safe to call repeatedly: the strategy first asks the gateway whether it
   * already holds a refund for this ledger row, so a retry reconciles rather
   * than sends the money twice.
   */
  async retryRefund(transactionId: string): Promise<TransactionResponse> {
    const refund = await transactionService.findById(transactionId);
    if (!refund || refund.type !== "REFUND") {
      throw appError(paymentErrors.REFUND_NOT_FOUND);
    }
    if (refund.status === "SUCCESS") {
      // Already settled. Re-running would be a no-op at best, so say plainly
      // that there is nothing owed rather than pretending work was done.
      throw appError(paymentErrors.REFUND_ALREADY_SETTLED);
    }

    const payment = await transactionService.findPaymentForRefund(refund);
    if (!payment) {
      // Nothing succeeded on this order, so there is no money to give back and
      // no gateway reference to give it back through.
      await transactionService.recordGatewayOutcome(refund.id, "FAILED", {
        metadata: { error: "no successful payment found for this order" },
      });
      throw appError(paymentErrors.REFUND_NO_PAYMENT);
    }

    await this.refundPayments([{ refund, payment }]);

    // Re-read: `refundPayments` records the outcome, so the row in hand is
    // stale by the time it returns. Reporting the pre-retry state would tell
    // the admin the retry did nothing.
    const settled = await transactionService.findById(transactionId);
    return toTransactionResponse(settled ?? refund);
  }

  /** Refunds that have not reached the customer yet. */
  async outstandingRefunds(limit?: number): Promise<TransactionResponse[]> {
    const refunds = await transactionService.findOutstandingRefunds(limit);
    return refunds.map(toTransactionResponse);
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

/**
 * Ledger row → API shape. `error` is lifted out of the metadata blob because
 * "why is this refund still owed" is the whole reason an admin opens the list,
 * and making them dig through JSON for it helps nobody.
 */
const toTransactionResponse = (t: TransactionModel): TransactionResponse => {
  const metadata = t.metadata as { error?: unknown } | null;
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    amount: Number(t.amount),
    currency: t.currency,
    paymentMethod: t.paymentMethod,
    internalTxNumber: t.internalTxNumber,
    externalRef: t.externalRef,
    orderId: t.orderId,
    error: typeof metadata?.error === "string" ? metadata.error : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
};

export const paymentService = new PaymentService();
