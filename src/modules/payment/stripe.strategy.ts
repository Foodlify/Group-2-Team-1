import type Stripe from "stripe";
import { Prisma } from "../../generated/prisma/client";
import type { TransactionModel } from "../../generated/prisma/models";
import env from "../../config/env";
import { getStripe } from "./stripe.client";
import type { TransactionStatus } from "../transaction/transaction.model";
import type {
  PaymentContextData,
  PaymentInitiation,
  PaymentResult,
  PaymentStrategy,
  RefundOutcome,
} from "./payment.strategy";

export class StripeCardStrategy implements PaymentStrategy {
  readonly method = "CREDIT_CARD" as const;

  async pay(
    _amount: number,
    _context: PaymentContextData,
  ): Promise<PaymentResult> {
    return {
      status: "PENDING",
      metadata: { gateway: "stripe", stage: "awaiting_checkout" },
    };
  }

  async initiate(
    transaction: TransactionModel,
    amount: number,
    context: PaymentContextData,
  ): Promise<PaymentInitiation> {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        success_url: env.STRIPE_SUCCESS_URL,
        cancel_url: env.STRIPE_CANCEL_URL,

        metadata: {
          orderId: context.orderId,
          transactionId: transaction.id,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: context.currency.toLowerCase(),
              unit_amount: StripeCardStrategy.toMinorUnits(amount),
              product_data: { name: `Order ${context.orderId}` },
            },
          },
        ],
      },
      {
        idempotencyKey: `order-payment-${transaction.id}`,
      },
    );

    return {
      externalRef: session.id,

      redirectUrl: session.url ?? undefined,
      metadata: {
        gateway: "stripe",
        stage: "checkout_created",
        sessionId: session.id,
        expiresAt: session.expires_at,
      },
    };
  }

  async refund(
    refundTransaction: TransactionModel,
    originalPayment: TransactionModel,
    amount: number,
  ): Promise<RefundOutcome> {
    const paymentIntentId =
      await StripeCardStrategy.resolvePaymentIntentId(originalPayment);

    const existing = await this.findExistingRefund(
      paymentIntentId,
      refundTransaction.id,
    );
    if (existing) {
      return {
        status: StripeCardStrategy.toTransactionStatus(existing.status),
        externalRef: existing.id,
        metadata: {
          gateway: "stripe",
          refundId: existing.id,
          refundStatus: existing.status,
          paymentIntentId,

          reconciled: true,
        },
      };
    }

    const refund = await getStripe().refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: StripeCardStrategy.toMinorUnits(amount),
        reason: "requested_by_customer",
        metadata: {
          orderId: originalPayment.orderId ?? "",
          refundTransactionId: refundTransaction.id,
        },
      },
      {
        idempotencyKey: `refund-${refundTransaction.id}`,
      },
    );

    return {
      status: StripeCardStrategy.toTransactionStatus(refund.status),
      externalRef: refund.id,
      metadata: {
        gateway: "stripe",
        refundId: refund.id,
        refundStatus: refund.status,
        paymentIntentId,
      },
    };
  }

  private async findExistingRefund(
    paymentIntentId: string,
    refundTransactionId: string,
  ): Promise<Stripe.Refund | null> {
    const refunds = await getStripe().refunds.list({
      payment_intent: paymentIntentId,
      limit: 100,
    });
    return (
      refunds.data.find(
        (refund) =>
          refund.metadata?.refundTransactionId === refundTransactionId,
      ) ?? null
    );
  }

  static async resolvePaymentIntentId(
    payment: TransactionModel & {
      details?: { paymentIntentId: string | null } | null;
    },
  ): Promise<string> {
    if (payment.details?.paymentIntentId)
      return payment.details.paymentIntentId;

    const metadata = payment.metadata as { paymentIntentId?: unknown } | null;
    if (typeof metadata?.paymentIntentId === "string") {
      return metadata.paymentIntentId;
    }

    if (!payment.externalRef) {
      throw new Error(
        `Payment ${payment.id} has no gateway reference to refund against`,
      );
    }

    const session = await getStripe().checkout.sessions.retrieve(
      payment.externalRef,
    );
    const intent = session.payment_intent;
    const id = typeof intent === "string" ? intent : intent?.id;
    if (!id) {
      throw new Error(
        `Checkout session ${payment.externalRef} has no payment intent to refund`,
      );
    }
    return id;
  }

  static toTransactionStatus(refundStatus: string | null): TransactionStatus {
    switch (refundStatus) {
      case "succeeded":
        return "SUCCESS";
      case "failed":
      case "canceled":
        return "FAILED";
      default:
        return "PENDING";
    }
  }

  static toMinorUnits(amount: number): number {
    const minor = new Prisma.Decimal(amount).times(100);
    if (!minor.isInteger()) {
      throw new Error(
        `Amount ${amount} cannot be represented in minor units without rounding`,
      );
    }
    return minor.toNumber();
  }
}

export const stripeCardStrategy = new StripeCardStrategy();
