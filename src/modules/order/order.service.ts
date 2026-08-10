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
// The repository, not the service: `restaurant.service` reaches into menus and
// caches, none of which an authorization check has any business touching.
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

/**
 * Who is asking to change an order.
 *
 * Required, not optional with an admin default: the whole point is that two
 * different actors reach `updateOrderStatus` and they are not interchangeable.
 * A caller that could omit this would be a caller that skips the check.
 */
export interface OrderActor {
  userId: string;
  role: string;
}

class OrderService {
  // ─── Place Order ──────────────────────────────────────────────
  async placeOrder(
    customerId: string,
    input: PlaceOrderInput,
  ): Promise<OrderResponse> {
    // `customerId` is resolved by the controller via
    // `requireCustomerIdByUserId`, so the customer is already known to exist —
    // no redundant existence re-check here.
    await this.assertAddressBelongsToCustomer(customerId, input.addressId);

    const result = await orderRepository.transaction(async (tx) => {
      // Row-level lock on the cart prevents concurrent mutations during checkout
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
        // Cart-snapshot price must match current menu price or the order is
        // rejected — exact Decimal comparison (no float coercion).
        if (!new Prisma.Decimal(current.price).equals(cartItem.price)) {
          throw new AppError(
            orderErrors.PRICE_CHANGED.message,
            orderErrors.PRICE_CHANGED.statusCode,
          );
        }
        // Reserve stock inside the checkout transaction with a conditional
        // UPDATE, so two concurrent checkouts for the last unit can't both
        // succeed. `stock === null` means the item isn't stock-tracked.
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

      // Accumulate the order total in Decimal for exact money arithmetic.
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

    // Build response directly from in-memory objects — no extra DB roundtrip
    const response = this.buildOrderResponse(result.order, result.createdItems);

    // Gateway hand-off happens HERE, outside the transaction. Doing it inside
    // would hold the cart's row lock and a pooled connection for the whole
    // HTTPS round-trip to the provider. Cash payments no-op through this.
    const paymentUrl = await this.initiatePaymentOrCancel(
      customerId,
      input.paymentMethod,
      result,
    );
    if (paymentUrl) response.paymentUrl = paymentUrl;

    // After the commit: the customer is only told about state that persisted.
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

  /**
   * Runs the gateway hand-off for a just-committed order and returns the URL
   * the customer must visit, if the method needs one.
   *
   * If the hand-off fails there is a committed order holding reserved stock
   * that can never be paid for, so it is cancelled — which releases the stock
   * and marks the pending payment FAILED through the existing side-effect
   * path — and the customer gets a 402 rather than an order they cannot
   * complete.
   */
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
        // Logged, not thrown: the customer still needs the payment error, and
        // an order stuck PENDING with no gateway session is recoverable by the
        // cancel endpoint. Losing the 402 behind a cleanup failure is not.
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

  // ─── Get My Orders (paginated) ────────────────────────────────
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

  // ─── Admin: list all orders (paginated) ──────────────────────
  async listAllOrders(query: ScopedOrderQuery): Promise<{
    data: OrderListItemResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    return this.listScopedOrders(
      query,
      query.restaurantId ? [query.restaurantId] : undefined,
    );
  }

  // ─── Restaurants Order History ───────────────────────────────
  /**
   * The official `Restaurants Order History` endpoint, scoped by ownership.
   *
   * The owned ids are resolved here on every request rather than read from the
   * token. An admin who reassigns or deletes a restaurant has to take effect on
   * the next request, not fifteen minutes later when the access token expires.
   *
   * An owner with no restaurants gets an empty page. That is the honest answer
   * — they have no orders — and it needs no error of its own.
   */
  async listRestaurantOrders(
    ownerId: string,
    query: ScopedOrderQuery,
  ): Promise<{
    data: OrderListItemResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const owned = await restaurantRepository.findIdsByOwnerId(ownerId);
    // Intersect rather than trust: asking for a restaurant someone else owns
    // narrows to nothing instead of widening past what they own.
    const scope = query.restaurantId
      ? owned.filter((id) => id === query.restaurantId)
      : owned;
    return this.listScopedOrders(query, scope);
  }

  /**
   * One order in full, for the owner of the restaurant that has to cook it —
   * the list carries a count, and a kitchen needs the items.
   *
   * A restaurant that isn't theirs is 403, the same answer and the same message
   * a customer gets for someone else's order.
   */
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

  /**
   * `restaurantIds` of `undefined` means unscoped — only the admin's unfiltered
   * listing passes that. Everything else passes a list, possibly empty.
   */
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

  // ─── Admin: get any order by ID (no ownership check) ─────────
  async getAnyOrder(orderId: string): Promise<OrderResponse> {
    const order = await orderRepository.findByIdWithDetails(orderId);
    if (!order)
      throw new AppError(
        orderErrors.ORDER_NOT_FOUND.message,
        orderErrors.ORDER_NOT_FOUND.statusCode,
      );
    return this.toOrderResponse(order);
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

    // Gateway refunds run here, outside the transaction — an HTTPS call to the
    // provider must not hold the order's row lock, and the refund's outcome is
    // recorded on its own PENDING ledger row either way.
    await paymentService.refundPayments(result.pendingRefunds);

    await notificationService.notifyOrderStatusChanged(
      customerId,
      orderId,
      "CANCELLED",
    );
    return result.response;
  }

  // ─── Update Order Status (admin, or the restaurant that owns it) ─────
  /**
   * Also the official `Cancelled Orders by Customers or Restaurants`: a
   * restaurant cancels by moving the order to CANCELLED through this same
   * endpoint, which means one state machine and one refund path serve both
   * actors rather than a second cancel route that could drift from the first.
   */
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

      // Before the transition is even considered: the role got the caller
      // through the route guard, this decides whether this particular order is
      // theirs. A RESTAURANT token is not a key to every restaurant's orders.
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

    // Same rule as `cancelOrder`: the gateway call happens after the commit.
    // An admin cancelling an order owes the customer their money just as much.
    await paymentService.refundPayments(result.pendingRefunds);

    await notificationService.notifyOrderStatusChanged(
      result.response.customerId,
      orderId,
      input.status,
    );
    return result.response;
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
      estimatedDeliveryTime: new Date(
        input.estimatedDeliveryTime,
      ).toISOString(),
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────

  /**
   * The ownership check, in one place so every actor-facing path shares it.
   *
   * ADMIN returns early and never touches the database — the platform operator
   * is not scoped to a restaurant, and making them pay for a lookup that can
   * only say "yes" would tax the busiest caller for nothing.
   *
   * Anyone else must own the restaurant. The failure is `ORDER_FORBIDDEN` —
   * deliberately the same 403 and the same message a customer gets for another
   * customer's order, so a probe learns nothing about who owns what.
   */
  private async assertMayManage(
    restaurantId: string,
    actor: OrderActor,
  ): Promise<void> {
    if (actor.role === "ADMIN") return;
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

  /**
   * Applies the financial side-effect of an order entering `status`, inside
   * the caller's transaction. Single source of truth for the status→effect
   * mapping so every path that changes status (cancel, admin update) stays
   * consistent. Statuses with no monetary effect are a no-op.
   */
  /**
   * Returns any REFUND rows that still have to be executed against a gateway;
   * the caller must pass them to `paymentService.refundPayments` once the
   * transaction has committed.
   */
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
      // Units reserved at checkout go back on the shelf.
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

  /**
   * Builds a response for an order whose status/timeline were just updated.
   * Takes status, timeline and updatedAt straight from the update result and
   * the rest from the base order row — avoiding an `as OrderWithDetails` cast.
   */
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
      // Multiply in Decimal, convert once at the boundary — the same rule
      // `cart.service.toCartResponse` and the order total already follow.
      // `Number(price) * quantity` returned 24.450000000000003 for 8.15 x 3,
      // and made the line subtotals disagree with `totalPrice`.
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
