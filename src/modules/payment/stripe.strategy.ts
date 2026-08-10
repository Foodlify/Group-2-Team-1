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

/**
 * Card payments via Stripe Checkout.
 *
 * Stripe hosts the payment page, so no card data ever reaches this server —
 * that is the whole reason for choosing Checkout over Payment Intents here.
 *
 * The flow is two-phase by necessity:
 *   `pay()`      — inside the checkout transaction, records the payment as
 *                  PENDING. Purely local.
 *   `initiate()` — after the commit, creates the Checkout Session and hands
 *                  back the URL the customer must visit.
 *
 * Nothing here marks a payment SUCCESS. That only ever happens when Stripe
 * calls the webhook back, because the customer's browser reaching the success
 * page proves nothing — they can close the tab, or forge the redirect.
 */
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
        // The webhook has nothing but this metadata to tie Stripe's event back
        // to our data, so both ids travel with the session.
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
        // Retrying a checkout for the same transaction must never create a
        // second session (and a second chance to be charged). Our transaction
        // id is unique per payment attempt, which is exactly the right key.
        idempotencyKey: `order-payment-${transaction.id}`,
      },
    );

    return {
      externalRef: session.id,
      // `url` is null only for sessions in `ui_mode: 'embedded'`, which this
      // is not — but the type is nullable, so it is normalised rather than
      // asserted away with `!`.
      redirectUrl: session.url ?? undefined,
      metadata: {
        gateway: "stripe",
        stage: "checkout_created",
        sessionId: session.id,
        expiresAt: session.expires_at,
      },
    };
  }

  /**
   * Returns money for `refundTransaction`, or reports the refund that already
   * exists for it.
   *
   * The lookup at the top is what makes retrying safe. The idempotency key
   * below stops a *duplicate request* becoming a duplicate refund, but Stripe
   * expires those keys after 24 hours — and a retry is by definition later than
   * the attempt it is retrying. Without this check, retrying a refund that
   * actually succeeded (and whose result we failed to record) the next day
   * would send the customer their money a second time.
   *
   * One extra round-trip on a rare operation buys "cannot double-refund" as a
   * property of the code rather than a hope about timing.
   */
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
          // Recorded so the ledger shows this row was reconciled with a refund
          // Stripe had already made, not that a new one was sent.
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
        // Keyed on our REFUND row, which exists exactly once per refund. A
        // retried request therefore returns the original refund instead of
        // sending the customer's money back a second time.
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

  /**
   * A refund Stripe already holds for this payment that we issued for this
   * exact ledger row, or null.
   *
   * Matched on our own `refundTransactionId` metadata rather than on the
   * amount: two separate refunds of the same order for the same amount are
   * indistinguishable by value, and adopting the wrong one would mark a second
   * obligation settled by the first one's money.
   *
   * A refund issued from the Stripe dashboard carries no such metadata and is
   * deliberately NOT matched — a human refunding by hand is not evidence that
   * *this* row was paid.
   */
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

  /**
   * Stripe refunds a PaymentIntent, not a Checkout Session, so the session id
   * in `externalRef` cannot be used directly.
   *
   * The id is normally recorded on the payment's metadata by the webhook that
   * confirmed it. Payments settled before that was stored — and any whose
   * metadata was lost — fall back to reading it off the session, so an old
   * order is still refundable rather than silently unrefundable.
   */
  static async resolvePaymentIntentId(
    payment: TransactionModel & {
      details?: { paymentIntentId: string | null } | null;
    },
  ): Promise<string> {
    // The typed column first — written by the same webhook that used to put
    // this in the metadata blob, and it cannot be misspelled. Read off the row
    // the caller already loaded rather than fetched here: a strategy that
    // queries the database on its own is a strategy you cannot unit test
    // without one.
    if (payment.details?.paymentIntentId)
      return payment.details.paymentIntentId;

    // Then the blob, for payments settled before `TransactionDetails` existed.
    // Their facts are still in there and are still correct; dropping this would
    // make every old order unrefundable without a round trip.
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

  /**
   * Stripe's refund lifecycle mapped onto our three states. `pending` and
   * `requires_action` stay PENDING deliberately: the money has not reached the
   * customer yet, and calling that SUCCESS would put a lie in the ledger. Those
   * settle later via the refund webhook.
   */
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

  /**
   * Stripe takes amounts as integers in the currency's minor unit — 45.50 EGP
   * is 4550 piastres. Rounding a float here is how gateways end up charging
   * 4549: `45.5 * 100` is fine, but `19.99 * 100` is 1998.9999999999998. The
   * amount is therefore scaled as a Decimal and only then made an integer.
   */
  static toMinorUnits(amount: number): number {
    const minor = new Prisma.Decimal(amount).times(100);
    if (!minor.isInteger()) {
      // A price with sub-piastre precision cannot be charged as-is. Failing
      // loudly beats silently rounding someone's money.
      throw new Error(
        `Amount ${amount} cannot be represented in minor units without rounding`,
      );
    }
    return minor.toNumber();
  }
}

export const stripeCardStrategy = new StripeCardStrategy();
