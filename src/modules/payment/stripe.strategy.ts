import { Prisma } from "../../generated/prisma/client";
import type { TransactionModel } from "../../generated/prisma/models";
import env from "../../config/env";
import { getStripe } from "./stripe.client";
import type {
  PaymentContextData,
  PaymentInitiation,
  PaymentResult,
  PaymentStrategy,
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
