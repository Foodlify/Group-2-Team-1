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
import { orderStatusRepository } from "../orderStatus/orderStatus.repository";
import { orderTrackingRepository } from "../orderTracking/orderTracking.repository";
import { VALID_TRANSITIONS } from "../orderStatus/orderStatus.model";
import type { OrderWithDetails, OrderListItem } from "./order.model";
import type {
  PlaceOrderInput,
  UpdateStatusInput,
  AddTrackingInput,
  OrderResponse,
  OrderListItemResponse,
} from "./order.validation";
import type { PaginationQuery } from "../../shared/schemas/pagination.schema";

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

      // 5. Create order
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

      // 7. Create initial status
      await orderStatusRepository.createStatus(order.id, "PENDING", tx);

      // 8. Process payment via Strategy + persist Transaction
      await paymentService.processPayment(
        input.paymentMethod,
        totalAmount,
        { orderId: order.id, customerId, currency: "EGP" },
        tx,
      );

      // 9. Clear cart (atomic — rolled back if anything above fails)
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
    query: PaginationQuery,
  ): Promise<{
    data: OrderListItemResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    await this.assertCustomerExists(customerId);

    const result = await orderRepository.findPaginatedByCustomer(
      customerId,
      query.page,
      query.limit,
    );

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

    const currentStatus = order.orderStatus[0]?.status;
    if (currentStatus !== "PENDING") {
      throw new AppError(
        orderErrors.ORDER_NOT_CANCELLABLE.message,
        orderErrors.ORDER_NOT_CANCELLABLE.statusCode,
      );
    }

    const updatedStatus = await orderStatusRepository.updateStatus(
      orderId,
      "CANCELLED",
    );
    order.orderStatus = [updatedStatus];

    return this.toOrderResponse(order);
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

    const currentStatus = order.orderStatus[0]?.status as
      | keyof typeof VALID_TRANSITIONS
      | undefined;
    if (!currentStatus) {
      throw new AppError(
        "Order has no status record",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }

    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed.includes(input.status as (typeof allowed)[number])) {
      throw new AppError(
        `Cannot transition from ${currentStatus} to ${input.status}`,
        orderErrors.INVALID_STATUS_TRANSITION.statusCode,
      );
    }

    const updatedStatus = await orderStatusRepository.updateStatus(
      orderId,
      input.status,
    );
    order.orderStatus = [updatedStatus];

    return this.toOrderResponse(order);
  }

  // ─── Add Order Status Tracking ────────────────────────────────
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

    const newTracking = await orderTrackingRepository.createTracking({
      orderId,
      currentLocation: input.currentLocation,
      estimatedDeliveryTime: new Date(input.estimatedDeliveryTime),
    });
    order.orderTrackings = [newTracking, ...order.orderTrackings];

    return this.toOrderResponse(order);
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

    return {
      id: order.id,
      customerId: order.customerId,
      addressId: order.addressId,
      orderDate: order.orderDate.toISOString(),
      status: (order.orderStatus[0]?.status ??
        "PENDING") as OrderResponse["status"],
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
      trackings: order.orderTrackings.map((t) => ({
        id: t.id,
        orderId: t.orderId,
        currentLocation: t.currentLocation,
        estimatedDeliveryTime: t.estimatedDeliveryTime.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
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
      status: (order.orderStatus[0]?.status ??
        "PENDING") as OrderListItemResponse["status"],
      itemCount,
      totalPrice,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}

export const orderService = new OrderService();
