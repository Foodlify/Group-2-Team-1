import logger from "../../config/logger";
import { describeError } from "../../shared/errors/describe";
import { mailer } from "../../shared/mail/mailer";
import { customerRepository } from "../customer/customer.repository";

/**
 * Order notifications over the existing mailer.
 *
 * Two rules everything here follows:
 * 1. **Never throws.** An email problem must never fail — or roll back — the
 *    order it is reporting, so every send is wrapped and failures are logged.
 * 2. **Called after the transaction commits**, never inside it: the customer
 *    should only be told about state that actually persisted, and SMTP
 *    latency must not hold a database transaction open.
 */
class NotificationService {
  async notifyOrderPlaced(
    customerId: string,
    order: {
      id: string;
      totalPrice: number;
      items: Array<{ name: string; quantity: number; price: number }>;
    },
  ): Promise<void> {
    await this.safeNotify("order placed", order.id, async () => {
      const contact = await customerRepository.findContactById(customerId);
      if (!contact) return;
      await mailer.sendOrderConfirmation(contact.user.email, {
        id: order.id,
        customerName: contact.user.name,
        totalPrice: order.totalPrice,
        items: order.items,
      });
    });
  }

  async notifyOrderStatusChanged(
    customerId: string,
    orderId: string,
    status: string,
  ): Promise<void> {
    await this.safeNotify("order status changed", orderId, async () => {
      const contact = await customerRepository.findContactById(customerId);
      if (!contact) return;
      await mailer.sendOrderStatusUpdate(contact.user.email, {
        id: orderId,
        customerName: contact.user.name,
        status,
      });
    });
  }

  private async safeNotify(
    event: string,
    orderId: string,
    send: () => Promise<void>,
  ): Promise<void> {
    try {
      await send();
    } catch (error) {
      // `{ error }` alone logs `{}` for a plain Error, and the transport's
      // reason is the only thing that makes this line actionable.
      logger.error("Order notification failed", {
        event,
        orderId,
        ...describeError(error),
      });
    }
  }
}

export const notificationService = new NotificationService();
