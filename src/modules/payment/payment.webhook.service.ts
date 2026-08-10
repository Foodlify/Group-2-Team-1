import type Stripe from "stripe";
import logger from "../../config/logger";
import { AppError } from "../../middlewares/error.middleware";
import { paymentErrors } from "../../shared/exceptions/payment.errors";
import { orderRepository } from "../order/order.repository";
import { orderService } from "../order/order.service";
import { transactionService } from "../transaction/transaction.service";
import { notificationService } from "../notification/notification.service";
import type { TimelineEntry } from "../order/order.model";
import { getStripe } from "./stripe.client";
import { StripeCardStrategy } from "./stripe.strategy";
import { verifySettlement } from "./payment.verification";
import env from "../../config/env";

/**
 * Handles Stripe's server-to-server callbacks.
 *
 * Two properties matter more than anything else here:
 *
 * 1. **Authenticity.** The endpoint is public — it has to be, Stripe calls it
 *    from its own servers with no session. The signature check IS the
 *    authentication, so an unverifiable body is rejected before it is parsed.
 *
 * 2. **Idempotency.** Stripe redelivers events for up to three days until it
 *    gets a 2xx, and can deliver the same event more than once regardless.
 *    Every handler therefore begins by looking for a *still-pending* gateway
 *    payment and returns quietly when there is none — so a replayed
 *    "completed" cannot settle an already-settled payment, and a replayed
 *    "expired" cannot cancel an order twice.
 */
class PaymentWebhookService {
  /**
   * Verifies the signature over the RAW request body and returns the event.
   *
   * The raw bytes are non-negotiable: the signature covers exactly what Stripe
   * sent, and a body that has been through `express.json()` and back is a
   * different byte sequence. That is why the route is mounted with
   * `express.raw` ahead of the global JSON parser.
   */
  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError(
        paymentErrors.UNSUPPORTED_METHOD.message,
        paymentErrors.UNSUPPORTED_METHOD.statusCode,
      );
    }
    if (!signature) {
      throw new AppError(
        paymentErrors.WEBHOOK_SIGNATURE_INVALID.message,
        paymentErrors.WEBHOOK_SIGNATURE_INVALID.statusCode,
      );
    }
    try {
      return getStripe().webhooks.constructEvent(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      logger.warn("Rejected a Stripe webhook with an invalid signature", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(
        paymentErrors.WEBHOOK_SIGNATURE_INVALID.message,
        paymentErrors.WEBHOOK_SIGNATURE_INVALID.statusCode,
      );
    }
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      // `completed` fires as soon as the customer finishes the checkout, which
      // for a delayed payment method is before any money has moved.
      // `async_payment_succeeded` is what says it finally did. Both land here
      // because `markPaid` settles only a session Stripe reports as `paid`,
      // so the pair is safe in either order and safe to redeliver.
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await this.markPaid(event.data.object);
        break;
      // `expired` fires when the customer never paid within 24 hours;
      // `async_payment_failed` when a delayed method was declined. Both mean
      // the same thing for us: this order will not be paid for.
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await this.markUnpaid(event.data.object);
        break;
      // Card refunds usually settle instantly, but Stripe may leave one
      // `pending` and finish it later. These events are what close that gap —
      // without them such a refund would sit PENDING in our ledger forever
      // even though the customer has their money back.
      case "refund.updated":
      case "refund.failed":
        await this.settleRefundEvent(event.data.object);
        break;
      default:
        // Not an error. Stripe sends whatever the endpoint is subscribed to,
        // and unknown types must still be acknowledged or it keeps retrying.
        logger.info("Ignoring unhandled Stripe event", { type: event.type });
    }
  }

  // ─── Handlers ─────────────────────────────────────────────

  private async markPaid(session: Stripe.Checkout.Session): Promise<void> {
    const orderId = this.readOrderId(session);
    if (!orderId) return;

    // A completed session is not a paid one. Delayed methods finish the
    // checkout before the money arrives and report `unpaid` here, settling
    // later via `async_payment_succeeded` (handled above). Recording SUCCESS
    // now would put a payment in the ledger that has not happened yet — and
    // the customer's own browser reaching the success page proves even less.
    if (session.payment_status !== "paid") {
      logger.info("Stripe checkout completed but not paid yet; leaving it", {
        orderId,
        sessionId: session.id,
        paymentStatus: session.payment_status,
      });
      return;
    }

    const outcome = await orderRepository.transaction(async (tx) => {
      const pending = await transactionService.findPendingGatewayPayment(
        orderId,
        tx,
      );
      // Already settled by an earlier delivery of this same event.
      if (!pending) return "already-settled" as const;

      // The signature proved the event is Stripe's. It did not prove the event
      // settles THIS payment — that the sum and currency which moved are the
      // ones this ledger row is owed. Without this check the webhook accepts
      // whatever figure the event carries, and an order for 100 is settled in
      // full by a session for 1.
      const discrepancy = verifySettlement(
        { amount: pending.amount, currency: pending.currency },
        { amountTotal: session.amount_total, currency: session.currency },
      );
      if (discrepancy) {
        // Left PENDING, not marked FAILED. The signature is valid, so money
        // genuinely moved at the gateway — calling it a failure would be as
        // untrue as calling it a success. "Unsettled and flagged" is the only
        // honest state, and it keeps the row in the outstanding admin views
        // where a human will see it. Metadata only: no status change.
        await transactionService.attachGatewayReference(
          pending.id,
          {
            metadata: {
              gateway: "stripe",
              stage: "verification_failed",
              sessionId: session.id,
              ...discrepancy,
            },
          },
          tx,
        );
        return { unverified: discrepancy } as const;
      }

      // The PaymentIntent id is captured here because it is the only thing
      // Stripe will refund against later — `externalRef` holds the Checkout
      // Session id, which its refund API does not accept.
      await transactionService.recordGatewayOutcome(
        pending.id,
        "SUCCESS",
        {
          metadata: {
            gateway: "stripe",
            stage: "paid",
            sessionId: session.id,
            paymentIntentId: this.readPaymentIntentId(session),
          },
        },
        tx,
      );

      // Conditional on the order still being PENDING, so this cannot drag an
      // order an admin has already advanced back to CONFIRMED. The payment is
      // recorded either way — money arriving is a fact independent of where
      // the order has got to.
      const entry: TimelineEntry = {
        status: "CONFIRMED",
        changedAt: new Date().toISOString(),
        changedBy: "stripe-webhook",
      };
      const updated = await orderRepository.appendTimelineEntry(
        orderId,
        entry,
        "PENDING",
        tx,
      );
      return updated ? ("confirmed" as const) : ("payment-only" as const);
    });

    if (outcome === "already-settled") {
      logger.info("Stripe webhook replayed for a settled payment; ignoring", {
        orderId,
        sessionId: session.id,
      });
      return;
    }
    if (typeof outcome === "object") {
      // Deliberately not thrown. A mismatch is permanent — the same event
      // redelivered for three days will disagree in exactly the same way — so
      // a 5xx would buy nothing but noise. The alarm belongs in the logs and
      // on the row, where it stays until somebody acts on it.
      logger.error("Stripe settled an amount we did not ask for", {
        orderId,
        sessionId: session.id,
        ...outcome.unverified,
      });
      return;
    }
    if (outcome === "payment-only") {
      logger.warn("Payment succeeded but the order was no longer PENDING", {
        orderId,
        sessionId: session.id,
      });
      return;
    }

    logger.info("Order confirmed by Stripe payment", {
      orderId,
      sessionId: session.id,
    });
    await this.notifyConfirmed(orderId);
  }

  private async markUnpaid(session: Stripe.Checkout.Session): Promise<void> {
    const orderId = this.readOrderId(session);
    if (!orderId) return;

    const order = await orderRepository.findById(orderId);
    if (!order) {
      logger.warn("Stripe webhook referenced an unknown order", { orderId });
      return;
    }

    // Both guards are needed. The pending-payment check makes a redelivered
    // event a no-op; the status check stops us cancelling an order that was
    // paid for and moved on by some other route.
    const pending = await transactionService.findPendingGatewayPayment(orderId);
    if (!pending || order.status !== "PENDING") {
      logger.info("Stripe failure event for an order already resolved", {
        orderId,
        status: order.status,
      });
      return;
    }

    // Cancelling is the whole cleanup: the existing side-effect path marks the
    // pending payment FAILED and puts the reserved units back on the shelf.
    await orderService.cancelOrder(order.customerId, orderId);
    logger.info("Order cancelled after an unpaid Stripe checkout", {
      orderId,
      sessionId: session.id,
    });
  }

  /**
   * Brings a refund's ledger row into line with the gateway's own view.
   *
   * Located by the refund id we stored when we created it, so an event for a
   * refund issued outside this system (from the Stripe dashboard, say) finds
   * nothing and is ignored rather than guessed at. Re-applying the same status
   * is harmless, which is what makes this safe to redeliver.
   */
  private async settleRefundEvent(refund: Stripe.Refund): Promise<void> {
    const existing = await transactionService.findByExternalRef(refund.id);
    if (!existing || existing.type !== "REFUND") {
      logger.info("Stripe refund event did not match a refund we issued", {
        refundId: refund.id,
      });
      return;
    }

    const status = StripeCardStrategy.toTransactionStatus(refund.status);
    if (existing.status === status) return;

    await transactionService.recordGatewayOutcome(existing.id, status, {
      metadata: {
        gateway: "stripe",
        refundId: refund.id,
        refundStatus: refund.status,
        failureReason: refund.failure_reason ?? null,
      },
    });
    logger.info("Refund status updated by Stripe", {
      transactionId: existing.id,
      orderId: existing.orderId,
      status,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────

  /** The PaymentIntent id from a session, whether expanded or not. */
  private readPaymentIntentId(session: Stripe.Checkout.Session): string | null {
    const intent = session.payment_intent;
    if (!intent) return null;
    return typeof intent === "string" ? intent : intent.id;
  }

  /**
   * Our order id, as attached to the session when it was created. Without it
   * the event cannot be tied to anything, so it is logged and dropped rather
   * than guessed at.
   */
  private readOrderId(session: Stripe.Checkout.Session): string | null {
    const orderId = session.metadata?.orderId;
    if (!orderId) {
      logger.warn("Stripe checkout session carried no orderId metadata", {
        sessionId: session.id,
      });
      return null;
    }
    return orderId;
  }

  private async notifyConfirmed(orderId: string): Promise<void> {
    const order = await orderRepository.findById(orderId);
    if (!order) return;
    await notificationService.notifyOrderStatusChanged(
      order.customerId,
      orderId,
      "CONFIRMED",
    );
  }
}

export const paymentWebhookService = new PaymentWebhookService();
