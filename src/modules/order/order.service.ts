import { AppError } from "../../middlewares/error.middleware";
import { orderErrors } from "../../shared/exceptions/order.errors";
import { customerService } from "../customer/customer.service";
import { addressService } from "../address/address.service";
import { menuItemService } from "../menuItem/menuItem.service";
import { cartService } from "../cart/cart.service";
import { paymentService } from "../payment/payment.service";
import { orderRepository } from "./order.repository";
import { orderItemRepository } from "../orderItem/orderItem.repository";
import { transactionRepository, TransactionRepository } from "../transaction/transaction.repository";
import { VALID_TRANSITIONS, type OrderStatusValue } from "./order.status";
import {
  parseTimeline,
  type OrderWithDetails,
  type OrderListItem,
  type TimelineEntry,
} from "./order.model";
import type { Prisma } from "../../generated/prisma/client";
import type {
  PlaceOrderInput,
  UpdateStatusInput,
  AddTrackingInput,
  OrderQuery,
  OrderResponse,
  OrderListItemResponse,
} from "./order.validation";

class OrderService {
  // ─── Place Order ──────────────────────────────────────────────
  async placeOrder(
    customerId: string,
    input: PlaceOrderInput,
  ): Promise<OrderResponse> {
    await this.assertCustomerExists(customerId);
    await this.assertAddressBelongsToCustomer(customerId, input.addressId);

    const result = await orderRepository.transaction(async (tx) => {
      // Row-level lock on the cart prevents concurrent mutations during checkout
      const cart = await cartService.lockByCustomerIdWithItems(customerId, tx);
      if (!cart) {
        throw new AppError(
          orderErrors.CART_NOT_FOUND.message,
          orderErrors.CART_NOT_FOUND.statusCode,
        );
      }
      if (cart.cartItems.length === 0) {
        throw new AppError(
          orderErrors.CART_EMPTY.message,
          orderErrors.CART_EMPTY.statusCode,
        );
      }

      const menuItemIds = cart.cartItems.map((ci) => ci.menuItemId);
      const currentMenuItems = await menuItemService.findManyByIds(menuItemIds);
      const currentMap = new Map(currentMenuItems.map((m) => [m.id, m]));

      for (const cartItem of cart.cartItems) {
        const current = currentMap.get(cartItem.menuItemId);
        if (!current) {
          throw new AppError(
            orderErrors.MENU_ITEM_UNAVAILABLE.message,
            orderErrors.MENU_ITEM_UNAVAILABLE.statusCode,
          );
        }
        // Cart-snapshot price must match current menu price or the order is rejected
        if (Number(current.price) !== Number(cartItem.price)) {
          throw new AppError(
            orderErrors.PRICE_CHANGED.message,
            orderErrors.PRICE_CHANGED.statusCode,
          );
        }
      }

      const totalAmount = cart.cartItems.reduce(
        (sum, ci) => sum + Number(ci.price) * ci.quantity,
        0,
      );

      const order = await orderRepository.createOrder(
        { customerId, addressId: input.addressId },
        tx,
      );

      const createdItems = await orderItemRepository.createManyWithTx(
        cart.cartItems.map((ci) => ({
          orderId: order.id,
          menuItemId: ci.menuItemId,
          quantity: ci.quantity,
          price: Number(ci.price),
          name: ci.name,
        })),
        tx,
      );

      await paymentService.processPayment(
        input.paymentMethod,
        totalAmount,
        { orderId: order.id, customerId, currency: "EGP" },
        tx,
      );

      await cartService.clearCart(customerId, tx);

      return { order, createdItems, totalAmount };
    });

    // Build response directly from in-memory objects — no extra DB roundtrip
    return this.buildOrderResponse(result.order, result.createdItems, result.totalAmount);
  }

  // ─── Get My Orders (paginated) ────────────────────────────────
  async getMyOrders(
    customerId: string,
    query: OrderQuery,
  ): Promise<{
    data: OrderListItemResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    await this.assertCustomerExists(customerId);

    const result = await orderRepository.findPaginatedByCustomer(customerId, {
      page: query.page,
      limit: query.limit,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });

    return {
      data: (result.data as OrderListItem[]).map((o) =>
        this.toOrderListItemResponse(o),
      ),
      meta: result.meta,
    };
  }

  // ─── Get Order By ID ──────────────────────────────────────────
  async getOrderById(
    customerId: string,
    orderId: string,
  ): Promise<OrderResponse> {
    const order = await orderRepository.findByIdWithDetails(orderId);
    if (!order)
      throw new AppError(
        orderErrors.ORDER_NOT_FOUND.message,
        orderErrors.ORDER_NOT_FOUND.statusCode,
      );
    if (order.customerId !== customerId) {
      throw new AppError(
        orderErrors.ORDER_FORBIDDEN.message,
        orderErrors.ORDER_FORBIDDEN.statusCode,
      );
    }
    return this.toOrderResponse(order);
  }

  // ─── Cancel Order ─────────────────────────────────────────────
  async cancelOrder(
    customerId: string,
    orderId: string,
  ): Promise<OrderResponse> {
    return orderRepository.transaction(async (tx) => {
      const order = await orderRepository.findById(orderId, tx);
      if (!order) {
        throw new AppError(
          orderErrors.ORDER_NOT_FOUND.message,
          orderErrors.ORDER_NOT_FOUND.statusCode,
        );
      }
      if (order.customerId !== customerId) {
        throw new AppError(
          orderErrors.ORDER_FORBIDDEN.message,
          orderErrors.ORDER_FORBIDDEN.statusCode,
        );
      }

      const entry: TimelineEntry = {
        status: "CANCELLED",
        changedAt: new Date().toISOString(),
      };
      const updated = await orderRepository.appendTimelineEntry(
        orderId,
        entry,
        "PENDING",
        tx,
      );
      if (!updated) {
        throw new AppError(
          orderErrors.ORDER_NOT_CANCELLABLE.message,
          orderErrors.ORDER_NOT_CANCELLABLE.statusCode,
        );
      }

      await this.reconcileTransactionsOnCancel(orderId, tx);

      const items = await orderItemRepository.findManyByOrderIdWithTx(
        orderId,
        tx,
      );

      return this.toOrderResponse({
        ...order,
        status: updated.status,
        timeline: updated.timeline,
        updatedAt: updated.updatedAt,
        orderItems: items,
      } as OrderWithDetails);
    });
  }

  // ─── Update Order Status (admin) ─────────────────────────────
  async updateOrderStatus(
    orderId: string,
    input: UpdateStatusInput,
  ): Promise<OrderResponse> {
    return orderRepository.transaction(async (tx) => {
      const order = await orderRepository.findById(orderId, tx);
      if (!order) {
        throw new AppError(
          orderErrors.ORDER_NOT_FOUND.message,
          orderErrors.ORDER_NOT_FOUND.statusCode,
        );
      }

      const currentStatus = order.status as OrderStatusValue;
      const allowed = VALID_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(input.status)) {
        throw new AppError(
          `Cannot transition from ${currentStatus} to ${input.status}`,
          orderErrors.INVALID_STATUS_TRANSITION.statusCode,
        );
      }

      const entry: TimelineEntry = {
        status: input.status,
        changedAt: new Date().toISOString(),
      };
      const updated = await orderRepository.appendTimelineEntry(
        orderId,
        entry,
        currentStatus,
        tx,
      );
      if (!updated) {
        throw new AppError(
          orderErrors.INVALID_STATUS_TRANSITION.message,
          orderErrors.INVALID_STATUS_TRANSITION.statusCode,
        );
      }

      if (input.status === "CANCELLED") {
        await this.reconcileTransactionsOnCancel(orderId, tx);
      }

      const items = await orderItemRepository.findManyByOrderIdWithTx(
        orderId,
        tx,
      );

      return this.toOrderResponse({
        ...order,
        status: updated.status,
        timeline: updated.timeline,
        updatedAt: updated.updatedAt,
        orderItems: items,
      } as OrderWithDetails);
    });
  }

  // ─── Add Order Status Tracking ────────────────────────────────
  // Appends a delivery-tracking entry (location + ETA) to the order's
  // timeline without changing its status.
  async addOrderStatusTracking(
    orderId: string,
    input: AddTrackingInput,
  ): Promise<OrderResponse> {
    const order = await this.findOrderOrThrow(orderId);
    return this.applyTimelineChange(order, {
      status: order.status as OrderStatusValue,
      location: input.currentLocation,
      estimatedDeliveryTime: new Date(input.estimatedDeliveryTime).toISOString(),
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private async reconcileTransactionsOnCancel(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const txs = await transactionRepository.findByOrderId(orderId, tx);
    for (const t of txs) {
      if (t.status === "SUCCESS") {
        await transactionRepository.createTransaction(
          {
            type: "REFUND",
            amount: Number(t.amount),
            currency: t.currency,
            status: "SUCCESS",
            paymentMethod: t.paymentMethod,
            orderId,
            internalTxNumber: TransactionRepository.generateRefundTxNumber(orderId),
          },
          tx,
        );
      } else {
        await transactionRepository.updateStatus(t.id, "FAILED", tx);
      }
    }
  }

  private async findOrderOrThrow(orderId: string): Promise<OrderWithDetails> {
    const order = await orderRepository.findByIdWithDetails(orderId);
    if (!order)
      throw new AppError(
        orderErrors.ORDER_NOT_FOUND.message,
        orderErrors.ORDER_NOT_FOUND.statusCode,
      );
    return order;
  }

  private async findOwnedOrderOrThrow(
    customerId: string,
    orderId: string,
  ): Promise<OrderWithDetails> {
    const order = await this.findOrderOrThrow(orderId);
    if (order.customerId !== customerId) {
      throw new AppError(
        orderErrors.ORDER_FORBIDDEN.message,
        orderErrors.ORDER_FORBIDDEN.statusCode,
      );
    }
    return order;
  }

  private async applyTimelineChange(
    order: OrderWithDetails,
    entryPartial: Omit<TimelineEntry, "changedAt">,
    expectedStatus?: string,
  ): Promise<OrderResponse> {
    const entry: TimelineEntry = {
      ...entryPartial,
      changedAt: new Date().toISOString(),
    };
    const updated = await orderRepository.appendTimelineEntry(
      order.id,
      entry,
      expectedStatus,
    );
    if (!updated) {
      throw new AppError(
        orderErrors.INVALID_STATUS_TRANSITION.message,
        orderErrors.INVALID_STATUS_TRANSITION.statusCode,
      );
    }

    let orderItems = order.orderItems;
    if (!orderItems || orderItems.length === 0) {
      orderItems = await orderItemRepository.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "asc" },
      });
    }

    return this.toOrderResponse({
      ...order,
      status: updated.status,
      timeline: updated.timeline,
      updatedAt: updated.updatedAt,
      orderItems,
    } as OrderWithDetails);
  }

  private async assertCustomerExists(customerId: string): Promise<void> {
    const customer = await customerService.findById(customerId);
    if (!customer)
      throw new AppError(
        orderErrors.CUSTOMER_NOT_FOUND.message,
        orderErrors.CUSTOMER_NOT_FOUND.statusCode,
      );
  }

  private async assertAddressBelongsToCustomer(
    customerId: string,
    addressId: string,
  ): Promise<void> {
    const address = await addressService.findById(addressId);
    if (!address)
      throw new AppError(
        orderErrors.ADDRESS_NOT_FOUND.message,
        orderErrors.ADDRESS_NOT_FOUND.statusCode,
      );
    if (address.customerId !== customerId) {
      throw new AppError(
        orderErrors.ADDRESS_FORBIDDEN.message,
        orderErrors.ADDRESS_FORBIDDEN.statusCode,
      );
    }
  }

  private buildOrderResponse(
    order: Awaited<ReturnType<typeof orderRepository.createOrder>>,
    items: Awaited<ReturnType<typeof orderItemRepository.createManyWithTx>>,
    totalPrice: number,
  ): OrderResponse {
    return {
      id: order.id,
      customerId: order.customerId,
      addressId: order.addressId,
      orderDate: order.orderDate.toISOString(),
      status: order.status as OrderResponse["status"],
      timeline: parseTimeline(order.timeline),
      items: items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        price: Number(item.price),
        subtotal: Number(item.price) * item.quantity,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      totalPrice,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  toOrderResponse(order: OrderWithDetails): OrderResponse {
    const totalPrice = order.orderItems.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );

    return {
      id: order.id,
      customerId: order.customerId,
      addressId: order.addressId,
      orderDate: order.orderDate.toISOString(),
      status: order.status as OrderResponse["status"],
      timeline: parseTimeline(order.timeline),
      items: order.orderItems.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        price: Number(item.price),
        subtotal: Number(item.price) * item.quantity,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      totalPrice,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private toOrderListItemResponse(order: OrderListItem): OrderListItemResponse {
    const totalPrice = order.orderItems.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );
    const itemCount = order.orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    return {
      id: order.id,
      customerId: order.customerId,
      addressId: order.addressId,
      orderDate: order.orderDate.toISOString(),
      status: order.status as OrderListItemResponse["status"],
      itemCount,
      totalPrice,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}

export const orderService = new OrderService();
