import logger from "../../config/logger";
import { describeError } from "../../shared/errors/describe";
import { mailer } from "../../shared/mail/mailer";
import { customerRepository } from "../customer/customer.repository";
import { pushService } from "../push/push.service";

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

    await this.safeNotify("order status push", orderId, async () => {
      await pushService.notifyCustomer(customerId, {
        title: "Order update",

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
      logger.error("Order notification failed", {
        event,
        orderId,
        ...describeError(error),
      });
    }
  }
}

export const notificationService = new NotificationService();
