import { StatusCodes } from "http-status-codes";
import { AppError } from "../../middlewares/error.middleware";
import { customerRepository } from "../customer/customer.repository";
import { addressRepository } from "../address/address.repository";
import { menuItemRepository } from "../menuItem/menuItem.repository";
import { orderRepository } from "./order.repository";
import { orderItemRepository } from "../orderItem/orderItem.repository";
import { orderStatusRepository } from "../orderStatus/orderStatus.repository";
import { orderTrackingRepository } from "../orderTracking/orderTracking.repository";
import { transactionRepository } from "../transaction/transaction.repository";
import { VALID_TRANSITIONS } from "../orderStatus/orderStatus.model";
import type { OrderWithDetails, OrderListItem } from "./order.model";
import type {
  PlaceOrderInput,
  UpdateStatusInput,
  AddTrackingInput,
  PayOrderInput,
  OrderResponse,
  OrderListItemResponse,
  TransactionResponse,
  PayOrderSuccessData,
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

    const menuItems = await Promise.all(
      input.items.map(async (item) => {
        const menuItem = await menuItemRepository.findById(item.menuItemId);
        if (!menuItem) {
          throw new AppError(
            `Menu item ${item.menuItemId} not found`,
            StatusCodes.NOT_FOUND,
          );
        }
        return { ...item, price: Number(menuItem.price), name: menuItem.name };
      }),
    );

    let orderId: string;

    await orderRepository.transaction(async (tx) => {
      const order = await orderRepository.createOrder(
        { customerId, addressId: input.addressId },
        tx,
      );
      orderId = order.id;

      await orderItemRepository.createManyWithTx(
        menuItems.map((item) => ({
          orderId: order.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          price: item.price,
          name: item.name,
        })),
        tx,
      );

      await orderStatusRepository.createStatus(order.id, "PENDING", tx);
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
    if (!order) throw new AppError("Order not found", StatusCodes.NOT_FOUND);
    if (order.customerId !== customerId) {
      throw new AppError(
        "This order does not belong to you",
        StatusCodes.FORBIDDEN,
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
    if (!order) throw new AppError("Order not found", StatusCodes.NOT_FOUND);
    if (order.customerId !== customerId) {
      throw new AppError(
        "This order does not belong to you",
        StatusCodes.FORBIDDEN,
      );
    }

    const currentStatus = order.orderStatus[0]?.status;
    if (currentStatus !== "PENDING") {
      throw new AppError(
        "Only PENDING orders can be cancelled",
        StatusCodes.BAD_REQUEST,
      );
    }

    await orderStatusRepository.updateStatus(orderId, "CANCELLED");

    const updated = await orderRepository.findByIdWithDetails(orderId);
    if (!updated)
      throw new AppError(
        "Order not found after update",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    return this.toOrderResponse(updated);
  }

  // ─── Update Order Status (admin) ─────────────────────────────
  async updateOrderStatus(
    orderId: string,
    input: UpdateStatusInput,
  ): Promise<OrderResponse> {
    const order = await orderRepository.findByIdWithDetails(orderId);
    if (!order) throw new AppError("Order not found", StatusCodes.NOT_FOUND);

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
        StatusCodes.BAD_REQUEST,
      );
    }

    await orderStatusRepository.updateStatus(orderId, input.status);

    const updated = await orderRepository.findByIdWithDetails(orderId);
    if (!updated)
      throw new AppError(
        "Order not found after update",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    return this.toOrderResponse(updated);
  }

  // ─── Add Tracking ─────────────────────────────────────────────
  async addTracking(
    orderId: string,
    input: AddTrackingInput,
  ): Promise<OrderResponse> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new AppError("Order not found", StatusCodes.NOT_FOUND);

    await orderTrackingRepository.createTracking({
      orderId,
      currentLocation: input.currentLocation,
      estimatedDeliveryTime: new Date(input.estimatedDeliveryTime),
    });

    const updated = await orderRepository.findByIdWithDetails(orderId);
    if (!updated)
      throw new AppError(
        "Order not found after update",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    return this.toOrderResponse(updated);
  }

  // ─── Pay Order ───────────────────────────────────────────────
  async payOrder(
    customerId: string,
    orderId: string,
    input: PayOrderInput,
  ): Promise<PayOrderSuccessData> {
    const order = await orderRepository.findByIdWithDetails(orderId);
    if (!order) throw new AppError("Order not found", StatusCodes.NOT_FOUND);
    if (order.customerId !== customerId) {
      throw new AppError(
        "This order does not belong to you",
        StatusCodes.FORBIDDEN,
      );
    }

    const currentStatus = order.orderStatus[0]?.status;
    if (currentStatus !== "PENDING") {
      throw new AppError(
        "Only PENDING orders can be paid",
        StatusCodes.BAD_REQUEST,
      );
    }

    const existing = await transactionRepository.findByOrderId(orderId);
    if (existing) {
      throw new AppError(
        "This order has already been paid",
        StatusCodes.BAD_REQUEST,
      );
    }

    let transactionId: string;

    await orderRepository.transaction(async (tx) => {
      const referenceNumber =
        input.paymentMethod === "CARD" ? crypto.randomUUID() : null;
      const transaction = await transactionRepository.createTransaction(
        {
          orderId,
          paymentMethod: input.paymentMethod,
          status: "COMPLETED",
          referenceNumber,
        },
        tx,
      );
      transactionId = transaction.id;
      await orderStatusRepository.updateStatus(orderId, "CONFIRMED", tx);
    });

    const [updatedOrder, transaction] = await Promise.all([
      orderRepository.findByIdWithDetails(orderId),
      transactionRepository.findById(transactionId!),
    ]);

    if (!updatedOrder || !transaction) {
      throw new AppError(
        "Failed to retrieve payment result",
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      order: this.toOrderResponse(updatedOrder),
      transaction: this.toTransactionResponse(transaction),
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private async assertCustomerExists(customerId: string): Promise<void> {
    const customer = await customerRepository.findById(customerId);
    if (!customer)
      throw new AppError("Customer not found", StatusCodes.NOT_FOUND);
  }

  private async assertAddressBelongsToCustomer(
    customerId: string,
    addressId: string,
  ): Promise<void> {
    const address = await addressRepository.findById(addressId);
    if (!address)
      throw new AppError("Address not found", StatusCodes.NOT_FOUND);
    if (address.customerId !== customerId) {
      throw new AppError(
        "This address does not belong to you",
        StatusCodes.FORBIDDEN,
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

  private toTransactionResponse(transaction: {
    id: string;
    orderId: string;
    paymentMethod: string;
    status: string;
    referenceNumber: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): TransactionResponse {
    return {
      id: transaction.id,
      orderId: transaction.orderId,
      paymentMethod:
        transaction.paymentMethod as TransactionResponse["paymentMethod"],
      status: transaction.status,
      referenceNumber: transaction.referenceNumber,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
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
