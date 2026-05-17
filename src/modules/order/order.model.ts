import type { OrderModel, OrderItemsModel, OrderStatusModel, OrderTrackingModel } from "../../generated/prisma/models";

export type OrderWithDetails = OrderModel & {
  orderItems: OrderItemsModel[];
  orderStatus: OrderStatusModel[];
  orderTrackings: OrderTrackingModel[];
};

export type OrderListItem = OrderModel & {
  orderItems: OrderItemsModel[];
  orderStatus: OrderStatusModel[];
};
