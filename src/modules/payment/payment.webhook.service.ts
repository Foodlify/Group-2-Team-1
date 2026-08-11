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

class PaymentWebhookService {
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
      case "checkout.session.async_payment_succeeded":
        await this.markPaid(event.data.object);
        break;

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await this.markUnpaid(event.data.object);
        break;

      case "refund.updated":
      case "refund.failed":
        await this.settleRefundEvent(event.data.object);
        break;
      default:
        logger.info("Ignoring unhandled Stripe event", { type: event.type });
    }
  }

  private async markPaid(session: Stripe.Checkout.Session): Promise<void> {
    const orderId = this.readOrderId(session);
    if (!orderId) return;

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

      if (!pending) return "already-settled" as const;

      const discrepancy = verifySettlement(
        { amount: pending.amount, currency: pending.currency },
        { amountTotal: session.amount_total, currency: session.currency },
      );
      if (discrepancy) {
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

    const pending = await transactionService.findPendingGatewayPayment(orderId);
    if (!pending || order.status !== "PENDING") {
      logger.info("Stripe failure event for an order already resolved", {
        orderId,
        status: order.status,
      });
      return;
    }

    await orderService.cancelOrder(order.customerId, orderId);
    logger.info("Order cancelled after an unpaid Stripe checkout", {
      orderId,
      sessionId: session.id,
    });
  }

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

  private readPaymentIntentId(session: Stripe.Checkout.Session): string | null {
    const intent = session.payment_intent;
    if (!intent) return null;
    return typeof intent === "string" ? intent : intent.id;
  }

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
