import type { OrderModel, OrderItemsModel } from "../../generated/prisma/models";
import type { OrderStatusValue } from "./order.status";

export type TimelineEntry = {
  status: OrderStatusValue;
  changedAt: string;
  changedBy?: string;
  location?: string;
  estimatedDeliveryTime?: string;
};

export type OrderWithDetails = OrderModel & {
  orderItems: OrderItemsModel[];
};

export type OrderListItem = OrderModel & {
  orderItems: OrderItemsModel[];
};

export function parseTimeline(value: unknown): TimelineEntry[] {
  return Array.isArray(value) ? (value as TimelineEntry[]) : [];
}
