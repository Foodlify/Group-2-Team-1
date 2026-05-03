import type { OrderModel, OrderItemsModel, OrderStatusModel, orderTrackingModel } from "../../generated/prisma/models";

export type OrderWithDetails = OrderModel & {
  orderItems: OrderItemsModel[];
  orderStatus: OrderStatusModel[];
  orderTrackings: orderTrackingModel[];
};

export type OrderListItem = OrderModel & {
  orderItems: OrderItemsModel[];
  orderStatus: OrderStatusModel[];
};
