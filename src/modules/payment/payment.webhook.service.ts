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
      case "checkout.session.completed":
        await this.markPaid(event.data.object);
        break;
      // `expired` fires when the customer never paid within 24 hours;
      // `async_payment_failed` when a delayed method was declined. Both mean
      // the same thing for us: this order will not be paid for.
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await this.markUnpaid(event.data.object);
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

    const outcome = await orderRepository.transaction(async (tx) => {
      const pending = await transactionService.findPendingGatewayPayment(
        orderId,
        tx,
      );
      // Already settled by an earlier delivery of this same event.
      if (!pending) return "already-settled" as const;

      await transactionService.updateStatus(pending.id, "SUCCESS", tx);

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

  // ─── Helpers ──────────────────────────────────────────────

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
