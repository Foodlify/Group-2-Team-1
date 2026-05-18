import { StatusCodes } from "http-status-codes";
import { AppError } from "../../middlewares/error.middleware";
import { orderErrors } from "../../shared/exceptions/order.errors";
import { customerService } from "../customer/customer.service";
import { addressService } from "../address/address.service";
import { menuItemService } from "../menuItem/menuItem.service";
import { cartService } from "../cart/cart.service";
import { paymentService } from "../payment/payment.service";
import { orderRepository } from "./order.repository";
import { orderItemRepository } from "../orderItem/orderItem.repository";
import { VALID_TRANSITIONS } from "./order.status";
import type { OrderWithDetails, OrderListItem, TimelineEntry } from "./order.model";
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

    let orderId: string;

    await orderRepository.transaction(async (tx) => {
      // 1. Lock the cart (row-level lock until tx commits/rolls back)
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

      // 2. Verify each menu item still exists (availability check)
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
        // 3. Price validation: cart snapshot must match current price
        if (Number(current.price) !== Number(cartItem.price)) {
          throw new AppError(
            orderErrors.PRICE_CHANGED.message,
            orderErrors.PRICE_CHANGED.statusCode,
          );
        }
      }

      // 4. Compute total amount (sum of price × quantity)
      const totalAmount = cart.cartItems.reduce(
        (sum, ci) => sum + Number(ci.price) * ci.quantity,
        0,
      );

      // 5. Create order (status="PENDING" + initial timeline entry, atomically)
      const order = await orderRepository.createOrder(
        { customerId, addressId: input.addressId },
        tx,
      );
      orderId = order.id;

      // 6. Create order items using cart snapshots (price + name)
      await orderItemRepository.createManyWithTx(
        cart.cartItems.map((ci) => ({
          orderId: order.id,
          menuItemId: ci.menuItemId,
          quantity: ci.quantity,
          price: Number(ci.price),
          name: ci.name,
        })),
        tx,
      );

      // 7. Process payment via Strategy + persist Transaction
      await paymentService.processPayment(
        input.paymentMethod,
        totalAmount,
        { orderId: order.id, customerId, currency: "EGP" },
        tx,
      );

      // 8. Clear cart (atomic — rolled back if anything above fails)
      await cartService.clearCart(customerId, tx);
    });

    const order = await orderRepository.findByIdWithDetails(orderId!);
    if (!order)
      throw new AppError(
        "Order not found after creation",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    return this.toOrderResponse(order);
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

    if (order.status !== "PENDING") {
      throw new AppError(
        orderErrors.ORDER_NOT_CANCELLABLE.message,
        orderErrors.ORDER_NOT_CANCELLABLE.statusCode,
      );
    }

    const entry: TimelineEntry = {
      status: "CANCELLED",
      changedAt: new Date().toISOString(),
    };
    const updated = await orderRepository.transaction((tx) =>
      orderRepository.appendTimelineEntry(orderId, entry, tx),
    );

    return this.toOrderResponse({ ...order, ...updated });
  }

  // ─── Update Order Status (admin) ─────────────────────────────
  async updateOrderStatus(
    orderId: string,
    input: UpdateStatusInput,
  ): Promise<OrderResponse> {
    const order = await orderRepository.findByIdWithDetails(orderId);
    if (!order)
      throw new AppError(
        orderErrors.ORDER_NOT_FOUND.message,
        orderErrors.ORDER_NOT_FOUND.statusCode,
      );

    const currentStatus = order.status as keyof typeof VALID_TRANSITIONS;
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(input.status as (typeof allowed)[number])) {
      throw new AppError(
        `Cannot transition from ${currentStatus} to ${input.status}`,
        orderErrors.INVALID_STATUS_TRANSITION.statusCode,
      );
    }

    const entry: TimelineEntry = {
      status: input.status,
      changedAt: new Date().toISOString(),
    };
    const updated = await orderRepository.transaction((tx) =>
      orderRepository.appendTimelineEntry(orderId, entry, tx),
    );

    return this.toOrderResponse({ ...order, ...updated });
  }

  // ─── Add Order Status Tracking ────────────────────────────────
  // Appends a delivery-tracking entry (location + ETA) to the order's
  // timeline without changing its status.
  async addOrderStatusTracking(
    orderId: string,
    input: AddTrackingInput,
  ): Promise<OrderResponse> {
    const order = await orderRepository.findByIdWithDetails(orderId);
    if (!order)
      throw new AppError(
        orderErrors.ORDER_NOT_FOUND.message,
        orderErrors.ORDER_NOT_FOUND.statusCode,
      );

    const entry: TimelineEntry = {
      status: order.status as TimelineEntry["status"],
      changedAt: new Date().toISOString(),
      location: input.currentLocation,
      estimatedDeliveryTime: new Date(input.estimatedDeliveryTime).toISOString(),
    };
    const updated = await orderRepository.transaction((tx) =>
      orderRepository.appendTimelineEntry(orderId, entry, tx),
    );

    return this.toOrderResponse({ ...order, ...updated });
  }

  // ─── Private Helpers ──────────────────────────────────────────

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

  toOrderResponse(order: OrderWithDetails): OrderResponse {
    const totalPrice = order.orderItems.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );

    const timeline = (order.timeline as unknown as
      | OrderResponse["timeline"]
      | undefined) ?? [];

    return {
      id: order.id,
      customerId: order.customerId,
      addressId: order.addressId,
      orderDate: order.orderDate.toISOString(),
      status: order.status as OrderResponse["status"],
      timeline,
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
