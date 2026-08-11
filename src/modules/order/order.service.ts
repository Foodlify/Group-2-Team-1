import { AppError } from "../../middlewares/error.middleware";
import logger from "../../config/logger";
import { orderErrors } from "../../shared/exceptions/order.errors";
import { paymentErrors } from "../../shared/exceptions/payment.errors";
import { describeError } from "../../shared/errors/describe";
import { addressService } from "../address/address.service";
import { menuItemService } from "../menuItem/menuItem.service";
import { cartService } from "../cart/cart.service";
import { paymentService } from "../payment/payment.service";
import { orderRepository } from "./order.repository";
import { orderItemRepository } from "../orderItem/orderItem.repository";

import { restaurantRepository } from "../restaurant/restaurant.repository";
import { notificationService } from "../notification/notification.service";
import {
  transactionService,
  type PendingGatewayRefund,
} from "../transaction/transaction.service";
import { VALID_TRANSITIONS, type OrderStatusValue } from "./order.status";
import {
  parseTimeline,
  type OrderWithDetails,
  type OrderListItem,
  type TimelineEntry,
} from "./order.model";
import { Prisma } from "../../generated/prisma/client";
import type {
  OrderModel,
  OrderItemsModel,
  TransactionModel,
} from "../../generated/prisma/models";
import type {
  PlaceOrderInput,
  UpdateStatusInput,
  AddTrackingInput,
  OrderQuery,
  ScopedOrderQuery,
  OrderResponse,
  OrderListItemResponse,
} from "./order.validation";

export interface OrderActor {
  userId: string;
  role: string;
}

class OrderService {
  async placeOrder(
    customerId: string,
    input: PlaceOrderInput,
  ): Promise<OrderResponse> {
    await this.assertAddressBelongsToCustomer(customerId, input.addressId);

    const result = await orderRepository.transaction(async (tx) => {
      const cart = await cartService.lockByOwnerWithItems({ customerId }, tx);
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

        if (!new Prisma.Decimal(current.price).equals(cartItem.price)) {
          throw new AppError(
            orderErrors.PRICE_CHANGED.message,
            orderErrors.PRICE_CHANGED.statusCode,
          );
        }

        if (current.stock !== null) {
          const reserved = await menuItemService.reserveStock(
            cartItem.menuItemId,
            cartItem.quantity,
            tx,
          );
          if (!reserved) {
            throw new AppError(
              orderErrors.OUT_OF_STOCK.message,
              orderErrors.OUT_OF_STOCK.statusCode,
            );
          }
        }
      }

      const totalAmount = cart.cartItems.reduce(
        (sum, ci) => sum.plus(new Prisma.Decimal(ci.price).times(ci.quantity)),
        new Prisma.Decimal(0),
      );

      const order = await orderRepository.createOrder(
        {
          customerId,
          addressId: input.addressId,
          totalAmount,
          restaurantId: cart.restaurantId,
        },
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

      const transaction = await paymentService.processPayment(
        input.paymentMethod,
        totalAmount.toNumber(),
        { orderId: order.id, customerId, currency: "EGP" },
        tx,
      );

      await cartService.clearCart({ customerId }, tx);

      return { order, createdItems, transaction, totalAmount };
    });

    const response = this.buildOrderResponse(result.order, result.createdItems);

    const paymentUrl = await this.initiatePaymentOrCancel(
      customerId,
      input.paymentMethod,
      result,
    );
    if (paymentUrl) response.paymentUrl = paymentUrl;

    await notificationService.notifyOrderPlaced(customerId, {
      id: response.id,
      totalPrice: response.totalPrice,
      items: response.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      })),
    });
    return response;
  }

  private async initiatePaymentOrCancel(
    customerId: string,
    method: PlaceOrderInput["paymentMethod"],
    result: {
      order: { id: string };
      transaction: TransactionModel;
      totalAmount: Prisma.Decimal;
    },
  ): Promise<string | undefined> {
    try {
      const initiation = await paymentService.initiatePayment(
        method,
        result.transaction,
        result.totalAmount.toNumber(),
        { orderId: result.order.id, customerId, currency: "EGP" },
      );
      return initiation.redirectUrl;
    } catch (error) {
      logger.error("Payment initiation failed — cancelling the order", {
        orderId: result.order.id,
        method,
        ...describeError(error),
      });
      try {
        await this.cancelOrder(customerId, result.order.id);
      } catch (cancelError) {
        logger.error("Failed to cancel the order after a payment failure", {
          orderId: result.order.id,
          ...describeError(cancelError),
        });
      }
      throw new AppError(
        paymentErrors.PAYMENT_FAILED.message,
        paymentErrors.PAYMENT_FAILED.statusCode,
      );
    }
  }

  async getMyOrders(
    customerId: string,
    query: OrderQuery,
  ): Promise<{
    data: OrderListItemResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const result = await orderRepository.findPaginatedByCustomer(customerId, {
      page: query.page,
      limit: query.limit,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      status: query.status,
    });

    return {
      data: (result.data as OrderListItem[]).map((o) =>
        this.toOrderListItemResponse(o),
      ),
      meta: result.meta,
    };
  }

  async listAllOrders(query: ScopedOrderQuery): Promise<{
    data: OrderListItemResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    return this.listScopedOrders(
      query,
      query.restaurantId ? [query.restaurantId] : undefined,
    );
  }

  async listRestaurantOrders(
    ownerId: string,
    query: ScopedOrderQuery,
  ): Promise<{
    data: OrderListItemResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const owned = await restaurantRepository.findIdsByOwnerId(ownerId);

    const scope = query.restaurantId
      ? owned.filter((id) => id === query.restaurantId)
      : owned;
    return this.listScopedOrders(query, scope);
  }

  async getRestaurantOrder(
    ownerId: string,
    orderId: string,
  ): Promise<OrderResponse> {
    const order = await this.findOrderOrThrow(orderId);
    const owns = await restaurantRepository.isOwnedBy(
      order.restaurantId,
      ownerId,
    );
    if (!owns) {
      throw new AppError(
        orderErrors.ORDER_FORBIDDEN.message,
        orderErrors.ORDER_FORBIDDEN.statusCode,
      );
    }
    return this.toOrderResponse(order);
  }

  private async listScopedOrders(
    query: ScopedOrderQuery,
    restaurantIds: string[] | undefined,
  ): Promise<{
    data: OrderListItemResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const result = await orderRepository.findPaginatedAll({
      page: query.page,
      limit: query.limit,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      status: query.status,
      restaurantIds,
    });
    return {
      data: (result.data as OrderListItem[]).map((o) =>
        this.toOrderListItemResponse(o),
      ),
      meta: result.meta,
    };
  }

  async getAnyOrder(orderId: string): Promise<OrderResponse> {
    const order = await orderRepository.findByIdWithDetails(orderId);
    if (!order)
      throw new AppError(
        orderErrors.ORDER_NOT_FOUND.message,
        orderErrors.ORDER_NOT_FOUND.statusCode,
      );
    return this.toOrderResponse(order);
  }

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

  async cancelOrder(
    customerId: string,
    orderId: string,
  ): Promise<OrderResponse> {
    const result = await orderRepository.transaction(async (tx) => {
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

      const pendingRefunds = await this.applyStatusSideEffects(
        orderId,
        "CANCELLED",
        tx,
      );

      const items = await orderItemRepository.findManyByOrderIdWithTx(
        orderId,
        tx,
      );

      return {
        response: this.composeOrderResponse(order, updated, items),
        pendingRefunds,
      };
    });

    await paymentService.refundPayments(result.pendingRefunds);

    await notificationService.notifyOrderStatusChanged(
      customerId,
      orderId,
      "CANCELLED",
    );
    return result.response;
  }

  async updateOrderStatus(
    orderId: string,
    input: UpdateStatusInput,
    actor: OrderActor,
  ): Promise<OrderResponse> {
    const result = await orderRepository.transaction(async (tx) => {
      const order = await orderRepository.findById(orderId, tx);
      if (!order) {
        throw new AppError(
          orderErrors.ORDER_NOT_FOUND.message,
          orderErrors.ORDER_NOT_FOUND.statusCode,
        );
      }

      await this.assertMayManage(order.restaurantId, actor);

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

      const pendingRefunds = await this.applyStatusSideEffects(
        orderId,
        input.status,
        tx,
      );

      const items = await orderItemRepository.findManyByOrderIdWithTx(
        orderId,
        tx,
      );

      return {
        response: this.composeOrderResponse(order, updated, items),
        pendingRefunds,
      };
    });

    await paymentService.refundPayments(result.pendingRefunds);

    await notificationService.notifyOrderStatusChanged(
      result.response.customerId,
      orderId,
      input.status,
    );
    return result.response;
  }

  async addOrderStatusTracking(
    orderId: string,
    input: AddTrackingInput,
  ): Promise<OrderResponse> {
    const order = await this.findOrderOrThrow(orderId);
    return this.applyTimelineChange(order, {
      status: order.status as OrderStatusValue,
      location: input.currentLocation,
      estimatedDeliveryTime: new Date(
        input.estimatedDeliveryTime,
      ).toISOString(),
    });
  }

  private async assertMayManage(
    restaurantId: string,
    actor: OrderActor,
  ): Promise<void> {
    if (actor.role === "ADMIN") return;

    if (actor.role !== "RESTAURANT") {
      throw new AppError(
        orderErrors.ORDER_FORBIDDEN.message,
        orderErrors.ORDER_FORBIDDEN.statusCode,
      );
    }
    const owns = await restaurantRepository.isOwnedBy(
      restaurantId,
      actor.userId,
    );
    if (owns) return;
    throw new AppError(
      orderErrors.ORDER_FORBIDDEN.message,
      orderErrors.ORDER_FORBIDDEN.statusCode,
    );
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

  private async applyStatusSideEffects(
    orderId: string,
    status: OrderStatusValue,
    tx: Prisma.TransactionClient,
  ): Promise<PendingGatewayRefund[]> {
    if (status === "CANCELLED") {
      const pendingRefunds = await transactionService.refundOrderTransactions(
        orderId,
        tx,
      );

      const items = await orderItemRepository.findManyByOrderIdWithTx(
        orderId,
        tx,
      );
      for (const item of items) {
        await menuItemService.releaseStock(item.menuItemId, item.quantity, tx);
      }
      return pendingRefunds;
    }

    if (status === "DELIVERED") {
      await transactionService.settleOrderTransactions(orderId, tx);
    }
    return [];
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

    return this.composeOrderResponse(order, updated, orderItems);
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
  ): OrderResponse {
    return this.toOrderResponse({ ...order, orderItems: items });
  }

  toOrderResponse(order: OrderWithDetails): OrderResponse {
    return {
      id: order.id,
      customerId: order.customerId,
      addressId: order.addressId,
      restaurantId: order.restaurantId,
      orderDate: order.orderDate.toISOString(),
      status: order.status as OrderResponse["status"],
      timeline: parseTimeline(order.timeline),
      items: order.orderItems.map((item) => this.toOrderItemResponse(item)),
      totalPrice: Number(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private composeOrderResponse(
    order: OrderModel,
    updated: { status: string; timeline: TimelineEntry[]; updatedAt: Date },
    orderItems: OrderItemsModel[],
  ): OrderResponse {
    return {
      id: order.id,
      customerId: order.customerId,
      addressId: order.addressId,
      restaurantId: order.restaurantId,
      orderDate: order.orderDate.toISOString(),
      status: updated.status as OrderResponse["status"],
      timeline: updated.timeline,
      items: orderItems.map((item) => this.toOrderItemResponse(item)),
      totalPrice: Number(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  private toOrderItemResponse(
    item: OrderItemsModel,
  ): OrderResponse["items"][number] {
    return {
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      price: Number(item.price),

      subtotal: new Prisma.Decimal(item.price).times(item.quantity).toNumber(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private toOrderListItemResponse(order: OrderListItem): OrderListItemResponse {
    const itemCount = order.orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    return {
      id: order.id,
      customerId: order.customerId,
      addressId: order.addressId,
      restaurantId: order.restaurantId,
      orderDate: order.orderDate.toISOString(),
      status: order.status as OrderListItemResponse["status"],
      itemCount,
      totalPrice: Number(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}

export const orderService = new OrderService();
