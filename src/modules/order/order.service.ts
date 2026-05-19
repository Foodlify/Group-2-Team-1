import { AppError } from "../../middlewares/error.middleware";
import { cartRepository } from "../cart/cart.repository";
import { cartService } from "../cart/cart.service";
import { orderRepository } from "./order.repository";

class OrderService {
  async getOrderById(customerId: string, orderId: string) {
    const order = await orderRepository.findByIdWithDetails(orderId);
    if (!order) {
      throw new AppError("Order not found", 404);
    }
    if (order.customerId !== customerId) {
      throw new AppError("You do not have access to this order", 403);
    }
    return order;
  }

  async getOrdersByCustomer(customerId: string) {
    const orders = await orderRepository.findManyByCustomerIdWithDetails(customerId);
    return orders;
  }

  async createOrder(userId: string, addressId: string) {
    const cart = await cartRepository.findByUserIdWithItems(userId);

    if (!cart || cart.items.length === 0) {
      throw new AppError("Cart is empty", 400);
    }

    const cartItems = cart.items.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
    }));

    const order = await orderRepository.createOrderWithItems({
      customerId: userId,
      addressId,
      items: cartItems,
    });

    await cartService.clearCart(userId);

    return order;
  }

  async updateOrder(customerId: string, orderId: string, data: { addressId?: string }) {
    const existing = await orderRepository.findByIdWithDetails(orderId);
    if (!existing) {
      throw new AppError("Order not found", 404);
    }
    if (existing.customerId !== customerId) {
      throw new AppError("You do not have access to this order", 403);
    }

    const updated = await orderRepository.updateOrder(orderId, data);
    return updated;
  }

  async cancelOrder(customerId: string, orderId: string) {
    const existing = await orderRepository.findByIdWithDetails(orderId);
    if (!existing) {
      throw new AppError("Order not found", 404);
    }
    if (existing.customerId !== customerId) {
      throw new AppError("You do not have access to this order", 403);
    }

    await orderRepository.cancelOrder(orderId);
  }
}

export const orderService = new OrderService();
