import logger from "../../config/logger";
import { describeError } from "../../shared/errors/describe";
import { mailer } from "../../shared/mail/mailer";
import { customerRepository } from "../customer/customer.repository";
import { pushService } from "../push/push.service";

/**
 * Order notifications, over email and Web Push.
 *
 * Three rules everything here follows:
 * 1. **Never throws.** A notification problem must never fail — or roll back —
 *    the order it is reporting, so every send is wrapped and failures logged.
 * 2. **Called after the transaction commits**, never inside it: the customer
 *    should only be told about state that actually persisted, and neither SMTP
 *    nor a push service should hold a database transaction open.
 * 3. **The channels are independent.** Each is wrapped separately, so a dead
 *    SMTP host cannot stop the push and an unreachable push service cannot
 *    stop the email. Wrapping them together would make either failure silence
 *    both, which is the opposite of why there are two.
 */
class NotificationService {
  /**
   * Deliberately email-only, unlike the status change.
   *
   * The customer is looking at the checkout response when this fires — the
   * order id is already on their screen, so buzzing the device in their hand to
   * report what it just did is noise. The scope map agrees: push sits under
   * `Notify Customer With Order Status`, while confirmation is
   * `Order Confirmation by email / SMS`.
   */
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

  /**
   * The official `Notify Customer With Order Status`. Email and push both, and
   * neither waits on the other.
   */
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

    await this.safeNotify("order status push", orderId, async () => {
      await pushService.notifyCustomer(customerId, {
        title: "Order update",
        // Lower-cased for the same reason the email does it: the enum is a
        // database value, and "OUT_FOR_DELIVERY" is not a sentence.
        body: `Your order is now ${status.toLowerCase().replace(/_/g, " ")}.`,
        orderId,
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
